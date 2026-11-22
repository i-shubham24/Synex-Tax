import { CircuitBreaker } from '../resilience/circuitBreaker.js';

/**
 * WhatsApp through Meta's Cloud API. A message a business starts must use a template Meta has
 * approved, so reminders go as the template named in WHATSAPP_REMINDER_TEMPLATE with five
 * parameters: client name, period, documents outstanding, due date, firm name. Settings:
 * WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_REMINDER_TEMPLATE, WHATSAPP_TEMPLATE_LANG
 * (default en). Meta's servers are outside India; only the message itself is sent.
 */
export interface WhatsAppSender {
  sendReminder(toE164: string, params: [string, string, string, string, string]): Promise<{ id: string }>;
}

const GRAPH = 'https://graph.facebook.com/v21.0';

/** After repeated failures, calls fail fast for a minute instead of piling up. */
const breaker = new CircuitBreaker({ name: 'WhatsApp', failureThreshold: 5, resetTimeoutMs: 60_000, timeoutMs: 15_000 });

export function whatsappFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): WhatsAppSender | null {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const template = env.WHATSAPP_REMINDER_TEMPLATE?.trim();
  if (!token || !phoneId || !/^\d+$/.test(phoneId) || !template) return null;
  return {
    async sendReminder(toE164, params) {
      const to = toE164.replace(/^\+/, '');
      if (!/^91[6-9]\d{9}$/.test(to)) throw new Error('Reminders go to Indian mobile numbers only.');
      // Template parameters cannot hold new lines or tabs, or more than four spaces in a row.
      const text = (s: string) => s.replace(/[\r\n\t]+/g, '; ').replace(/ {4,}/g, ' ').slice(0, 1000);
      const r = await breaker.execute(() => fetchFn(`${GRAPH}/${phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: { name: template, language: { code: env.WHATSAPP_TEMPLATE_LANG || 'en' }, components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: text(p) })) }] },
        }),
        signal: AbortSignal.timeout(10_000),
      }).then((res) => {
        if (res.status >= 500) throw new Error(`WhatsApp answered ${res.status}`);
        return res;
      }));
      const b = (await r.json().catch(() => ({}))) as { messages?: { id: string }[] };
      if (!r.ok) throw new Error(`WhatsApp message not sent (${r.status})`);
      return { id: b.messages?.[0]?.id ?? '' };
    },
  };
}
