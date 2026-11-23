import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AisImportError, EarlierReturnError, earlierReturnPrefill, matchAis, parseAis, parseEarlierReturn,
  type AisReturnInput, type EarlierReturnImport,
} from '@synextax/tax-engine';
import { publicMessage } from '../plugins/publicError.js';

/** Uploaded files are read in memory up to this size and never stored. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const maskPan = (pan: string) => (PAN_RE.test(pan) ? `XXXXX${pan.slice(5)}` : pan ? 'XXXXXXXXXX' : '');

const money = z.number().finite().min(-1e13).max(1e13);
const s = (max: number) => z.string().max(max);

/** The file as text, or already parsed; or the return JSON itself as the body. */
const FileBody = z.object({
  text: s(MAX_IMPORT_BYTES).optional(),
  json: z.unknown().optional(),
  /** The client's PAN in SynexTax, to check the file belongs to the client. Never echoed back. */
  clientPan: z.string().trim().toUpperCase().regex(PAN_RE).optional(),
});

const ReturnBody: z.ZodType<AisReturnInput> = z.object({
  salary: z.object({
    gross: money.optional(),
    employers: z.array(z.object({ tan: s(10).optional(), name: s(125), gross: money.optional(), incomeChargeable: money.optional(), tds: money.optional() })).max(50).optional(),
  }).optional(),
  house: z.object({ letOut: z.boolean().optional(), rent: money.optional() }).optional(),
  houses: z.array(z.object({ letOut: z.boolean().optional(), rent: money.optional() })).max(50).optional(),
  otherSources: z.object({ savingsInterest: money.optional(), depositInterest: money.optional(), refundInterest: money.optional(), dividends: money.optional(), other: money.optional() }).optional(),
  capitalGains: z.array(z.object({ kind: s(10).optional(), saleValue: money })).max(5000).optional(),
  ltcg112A: z.object({ saleValue: money }).optional(),
  business: z.object({
    ad: z.object({ digital: money.optional(), cash: money.optional(), otherMode: money.optional() }).optional(),
    ada: z.object({ digital: money.optional(), cash: money.optional(), otherMode: money.optional() }).optional(),
    books: z.object({ turnover: money.optional(), revenue: money.optional() }).optional(),
  }).optional(),
  tdsOther: z.array(z.object({ tan: s(10), name: s(125), section: s(10).optional(), amount: money.optional(), tds: money })).max(500).optional(),
  tcs: z.union([money, z.array(z.object({ tan: s(10), name: s(125), tcs: money })).max(200)]).optional(),
  taxPayments: z.array(z.object({ bsr: s(7).optional(), date: s(10), serial: z.number().int().min(0).max(99999).optional(), amount: money, kind: z.enum(['ADVANCE', 'SELF']).optional() })).max(200).optional(),
});

const AisBody = FileBody.extend({
  return: ReturnBody.optional(),
  tolerance: z.object({ absolute: z.number().min(0).max(100000), percent: z.number().min(0).max(20) }).optional(),
});

/** What the upload holds: a JSON body with text or json, a bare file posted as JSON, or plain text. */
function fileOf(body: unknown): { file: unknown; extra: Record<string, unknown> } | null | 'TOO_LARGE' {
  if (typeof body === 'string') return body.length > MAX_IMPORT_BYTES ? 'TOO_LARGE' : { file: body, extra: {} };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.text === 'string') return { file: b.text, extra: b };
  if (b.json !== undefined) return { file: b.json, extra: b };
  return { file: b, extra: {} };
}

function maskEarlier(r: EarlierReturnImport) {
  const prefill = earlierReturnPrefill(r);
  return {
    ...r,
    client: { ...r.client, pan: maskPan(r.client.pan) },
    // The PAN is never prefilled from the file: the client's PAN in SynexTax is used.
    prefill: { ...prefill, person: { ...prefill.person, pan: undefined } },
  };
}

/**
 * Imports that save retyping in an income tax return. Mounted at /api/v1/itr-import.
 * Nothing here is stored: the file is parsed in memory and the result returned.
 */
export async function itrImportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
  });

  // A file posted as is, as text.
  fastify.addContentTypeParser('text/plain', { parseAs: 'string', bodyLimit: MAX_IMPORT_BYTES }, (_req, body, done) => done(null, body));

  const opts = { bodyLimit: MAX_IMPORT_BYTES + 64 * 1024, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  fastify.post('/earlier-return', opts, async (request, reply) => {
    const f = fileOf(request.body);
    if (f === 'TOO_LARGE') {
      return reply.status(413).send({ error: 'Too large', message: 'The file can be up to 5 MB.' });
    }
    if (!f || typeof f !== 'object') {
      return reply.status(400).send({ error: 'Invalid', message: 'Upload last year\'s return JSON.' });
    }
    const b = FileBody.safeParse(f.extra);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Check the upload: the file can be up to 5 MB and the client PAN must be a valid PAN.' });
    try {
      const r = parseEarlierReturn(f.file);
      const panMatchesClient = b.data.clientPan ? b.data.clientPan === r.client.pan : undefined;
      return reply.send({ ...maskEarlier(r), ...(panMatchesClient !== undefined ? { panMatchesClient } : {}) });
    } catch (err) {
      if (err instanceof EarlierReturnError) return reply.status(400).send({ error: 'Invalid', message: err.message });
      request.log.error({ err }, 'earlier return import failed');
      return reply.status(500).send({ error: 'Error', message: publicMessage(err) });
    }
  });

  fastify.post('/ais', opts, async (request, reply) => {
    const f = fileOf(request.body);
    if (f === 'TOO_LARGE') {
      return reply.status(413).send({ error: 'Too large', message: 'The file can be up to 5 MB.' });
    }
    if (!f || typeof f !== 'object') {
      return reply.status(400).send({ error: 'Invalid', message: 'Upload the AIS JSON.' });
    }
    const b = AisBody.safeParse(f.extra);
    if (!b.success) {
      const fields = [...new Set(b.error.issues.map((i) => i.path.slice(0, 2).join('.')))].slice(0, 6);
      return reply.status(400).send({ error: 'Invalid', message: `Check: ${fields.join(', ')}.` });
    }
    try {
      const ais = parseAis(f.file);
      const clientPan = b.data.clientPan;
      const panMatchesClient = clientPan && ais.taxpayer.pan ? ais.taxpayer.pan.slice(5) === clientPan.slice(5) : undefined;
      const match = b.data.return ? matchAis(ais, b.data.return, b.data.tolerance) : undefined;
      return reply.send({ ais, ...(match ? { match } : {}), ...(panMatchesClient !== undefined ? { panMatchesClient } : {}) });
    } catch (err) {
      if (err instanceof AisImportError) return reply.status(400).send({ error: 'Invalid', message: err.message });
      request.log.error({ err }, 'AIS import failed');
      return reply.status(500).send({ error: 'Error', message: publicMessage(err) });
    }
  });
}
