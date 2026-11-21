import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { FeatureFlagSchema } from '@synextax/shared-schemas';
import { verifyWebhookSignature } from '../security/webhookSecurity.js';

type PortalKind = 'GSTN' | 'NIC_IRP' | 'TRACES' | 'CBDT_EFILING';
type PortalState = 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'UNKNOWN';
const PORTAL_URLS: Array<{ portal: PortalKind; name: string; url: string }> = [
  { portal: 'GSTN', name: 'GST portal', url: 'https://www.gst.gov.in/' },
  { portal: 'NIC_IRP', name: 'e-Invoice (IRP)', url: 'https://einvoice1.gst.gov.in/' },
  { portal: 'TRACES', name: 'TRACES', url: 'https://www.tdscpc.gov.in/' },
  { portal: 'CBDT_EFILING', name: 'Income Tax e-Filing', url: 'https://www.incometax.gov.in/' },
];
let portalCache: { at: number; body: unknown } | null = null;

async function probe(url: string): Promise<{ status: PortalState; latencyMs: number; message: string }> {
  if (process.env.NODE_ENV === 'test' || process.env.PORTAL_PROBES === 'off') return { status: 'UNKNOWN', latencyMs: 0, message: 'Not checked in this environment.' };
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'SynexTax portal check' } });
    const ms = Date.now() - started;
    await res.body?.cancel().catch(() => undefined);
    if (res.status >= 500) return { status: 'DEGRADED', latencyMs: ms, message: `The site answered with error ${res.status}.` };
    return ms > 2500 ? { status: 'DEGRADED', latencyMs: ms, message: 'The site answered slowly.' } : { status: 'OPERATIONAL', latencyMs: ms, message: 'The site answered normally.' };
  } catch {
    return { status: 'UNKNOWN', latencyMs: 0, message: 'Could not reach the site from SynexTax just now.' };
  } finally {
    clearTimeout(timer);
  }
}

async function portalHealth() {
  if (portalCache && Date.now() - portalCache.at < 5 * 60 * 1000) return portalCache.body;
  const checkedAt = new Date().toISOString();
  const portals = await Promise.all(PORTAL_URLS.map(async (p) => ({ portal: p.portal, name: p.name, ...(await probe(p.url)), lastChecked: checkedAt })));
  const order: PortalState[] = ['OUTAGE', 'DEGRADED', 'OPERATIONAL'];
  const known = portals.filter((p) => p.status !== 'UNKNOWN');
  const overallStatus: PortalState = known.length ? order.find((s) => known.some((p) => p.status === s)) ?? 'OPERATIONAL' : 'UNKNOWN';
  const body = { overallStatus, checkedAt, portals };
  portalCache = { at: Date.now(), body };
  return body;
}

export async function complianceRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // Live Statutory Feature Flags
  const featureFlags = [
    {
      flagCode: 'GSTN_ADV_687',
      enabled: true,
      effectiveFrom: '2027-01-01',
      description: 'Variable length E-Way Bill numbers (up to 32 characters) cutover readiness',
    },
    {
      flagCode: 'GSTN_ADV_688',
      enabled: true,
      effectiveFrom: '2027-01-01',
      description: 'Consolidated E-Way Bill (CEWB) multi-vehicle dynamic formatting support',
    },
    {
      flagCode: 'IMS_48HR_DEEMED_ACCEPTANCE_GUARD',
      enabled: true,
      effectiveFrom: '2026-10-01',
      description: 'Automated 12th of month scan for unactioned IMS records exceeding Rs 25,000 threshold',
    },
    {
      flagCode: 'ITNS_281N_MULTI_SECTION',
      enabled: true,
      effectiveFrom: '2026-04-01',
      description: 'Dual-Act TDS/TCS support allowing up to 20 section codes under IT Act 2025',
    },
    {
      flagCode: 'ADVISORY_643_LEDGER_GUARDS',
      enabled: true,
      effectiveFrom: '2026-08-01',
      description: 'Automated hard stop on Table 4(D)(1) reclaim exceeding closing balance + 4(B)(2) reversals',
    },
  ];

  fastify.get('/flags', async (_request, reply) => {
    return reply.send({
      timestamp: new Date().toISOString(),
      flags: featureFlags,
    });
  });

  // ---------------------------------------------------------------------
  // Government portal reachability: a timed request to each portal's public home page from this
  // server, cached for five minutes. It says whether the site answers and how fast, nothing more;
  // when this server cannot reach the internet the status is UNKNOWN, not a guess.
  // ---------------------------------------------------------------------
  fastify.get('/portal-health', async (_request, reply) => reply.send(await portalHealth()));

  // Statutory Webhook Receiver with HMAC-SHA256 signature and replay verification
  fastify.post('/webhook', async (request, reply) => {
    const signature = (request.headers['x-synextax-signature'] || request.headers['x-gstn-signature']) as string;
    const timestamp = (request.headers['x-synextax-timestamp'] || request.headers['x-gstn-timestamp']) as string;
    const secret = process.env.WEBHOOK_SECRET || 'synextax_statutory_webhook_hmac_secret_2026!';

    const verification = verifyWebhookSignature({
      secret,
      signatureHeader: signature,
      timestampHeader: timestamp,
      payload: JSON.stringify(request.body || {}),
      maxAgeSeconds: 300,
    });

    if (!verification.isValid) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: verification.error || 'Statutory webhook signature verification failed',
      });
    }

    return reply.status(200).send({
      received: true,
      timestampIst: new Date().toISOString(),
      status: 'PROCESSED',
    });
  });
}
