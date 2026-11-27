import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { s3StoreFromEnv } from '../integrations/s3Store.js';
import { sesMailerFromEnv } from '../integrations/mail.js';
import { whatsappFromEnv } from '../integrations/whatsapp.js';
import { bedrockFromEnv } from '../integrations/bedrock.js';
import { agentSigningKey } from '../security/agentChallenge.js';
import { isLocalEnv } from '../security/env.js';
import { PROMPT_INJECTION_GUARD, wrapUntrustedForPrompt } from '../security/inputSanitization.js';

const FVU_SYSTEM =
  `${PROMPT_INJECTION_GUARD}` +
  'You help an Indian chartered accountant fix a TDS statement that Protean\'s File Validation Utility rejected. ' +
  'Explain each error in plain words and say which field to correct. Placeholders such as [PAN_1] stand for identifiers; keep them as they are. ' +
  'Be brief. Do not invent rules; if an error is unclear, say so.';

/** Which outside services are set up, and the assistant that explains FVU errors. */
export async function integrationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
  });

  const assistant = bedrockFromEnv();

  fastify.get('/status', async (_request, reply) => {
    let agent = true;
    try {
      agentSigningKey();
    } catch {
      agent = false;
    }
    return reply.send({
      uploads: Boolean(s3StoreFromEnv()) ? 'S3' : process.env.FILE_STORE_DIR ? 'DISK' : !isLocalEnv() ? 'OFF' : 'DEV_DISK',
      email: Boolean(sesMailerFromEnv()),
      whatsapp: Boolean(whatsappFromEnv()),
      assistant: Boolean(assistant),
      itrSoftwareId: /^SW\d{8}$/.test(process.env.ITR_SOFTWARE_ID ?? ''),
      desktopAgent: agent,
    });
  });

  fastify.post('/assist/fvu-errors', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!assistant) return reply.status(503).send({ error: 'NOT_CONFIGURED', message: 'The assistant is not set up (Bedrock in India).' });
    const b = z.object({ text: z.string().min(1).max(20000) }).safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Send the error report text.' });
    try {
      return reply.send({ answer: await assistant.ask(FVU_SYSTEM, wrapUntrustedForPrompt('untrusted_fvu_report', b.data.text)) });
    } catch (err) {
      request.log.warn({ err: (err as Error).message }, 'assistant failed');
      return reply.status(502).send({ error: 'NO_ANSWER', message: 'The assistant did not answer. Try again later.' });
    }
  });
}
