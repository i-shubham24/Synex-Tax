import { redactPii, restorePii } from '@synextax/tax-engine';
import { awsCredentials, indiaRegion, signAws, awsEncode } from './aws.js';
import { CircuitBreaker } from '../resilience/circuitBreaker.js';

/** After repeated failures, calls fail fast for a minute instead of piling up. */
const breaker = new CircuitBreaker({ name: 'Bedrock', failureThreshold: 5, resetTimeoutMs: 60_000, timeoutMs: 35000 });

/** A model answer can take a while; a hung connection must not hold the request. */
const TIMEOUT_MS = 30_000;

/**
 * A language model through Amazon Bedrock in India. Settings: BEDROCK_REGION (ap-south-1 or
 * ap-south-2), BEDROCK_MODEL_ID (a model or an India inference profile, which keeps requests
 * between Mumbai and Hyderabad; a global profile would not, so the ID is checked), and the AWS keys.
 * PAN, GSTIN, TAN, Aadhaar, account numbers and similar are replaced with placeholders before the
 * text leaves the server and put back in the answer.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface Assistant {
  ask(system: string, text: string): Promise<string>;
  /** A conversation: earlier turns and the new question, each redacted with one shared map. */
  converse(system: string, turns: ChatTurn[], opts?: { maxTokens?: number }): Promise<string>;
}

/** Joins turns so one redaction covers them all: the same PAN gets the same placeholder everywhere. */
const BREAK = '\n\u0000SYNX_TURN\u0000\n';

export function bedrockFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): Assistant | null {
  const region = indiaRegion(env.BEDROCK_REGION);
  const model = env.BEDROCK_MODEL_ID?.trim();
  const credentials = awsCredentials(env);
  if (!region || !model || !credentials) return null;
  // Cross-region profiles carry a geography prefix; only the India one stays in India.
  const prefix = model.split('.')[0];
  if (['global', 'us', 'eu', 'apac', 'jp', 'au', 'ca'].includes(prefix)) return null;
  const converse: Assistant['converse'] = async (system, turns, opts = {}) => {
      if (!turns.length || turns[turns.length - 1].role !== 'user') throw new Error('The last turn must be the user’s.');
      const { text: joined, map } = redactPii(turns.map((t) => t.text).join(BREAK));
      const parts = joined.split(BREAK);
      // Bedrock wants turns to alternate; consecutive turns of one role are merged.
      const messages: Array<{ role: 'user' | 'assistant'; content: Array<{ text: string }> }> = [];
      turns.forEach((t, i) => {
        const last = messages[messages.length - 1];
        if (last && last.role === t.role) last.content[0].text += `

${parts[i]}`;
        else messages.push({ role: t.role, content: [{ text: parts[i] }] });
      });
      if (messages[0]?.role !== 'user') messages.shift();
      const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${awsEncode(model)}/converse`;
      const body = JSON.stringify({
        system: [{ text: system }],
        messages,
        inferenceConfig: { maxTokens: Math.min(opts.maxTokens ?? 800, 4000), temperature: 0.2 },
      });
      const headers = signAws({ method: 'POST', url, region, service: 'bedrock', body, credentials, headers: { 'content-type': 'application/json' } });
      const r = await breaker.execute(async () => {
        const res = await fetchFn(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status >= 500) throw new Error(`Bedrock answered ${res.status}`);
        return res;
      });
      const b = (await r.json().catch(() => ({}))) as { output?: { message?: { content?: { text?: string }[] } } };
      if (!r.ok) throw new Error(`The assistant did not answer (${r.status})`);
      const answer = (b.output?.message?.content ?? []).map((c) => c.text ?? '').join('');
      return restorePii(answer, map);
  };
  return {
    ask: (system, text) => converse(system, [{ role: 'user', text }]),
    converse,
  };
}
