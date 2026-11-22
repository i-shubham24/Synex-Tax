import { CircuitBreaker } from '../../resilience/circuitBreaker.js';

/**
 * WhatsApp message telling a payee their TDS certificate is ready, with a download link. Meta only
 * delivers business-started messages as approved templates, so this uses the template named in
 * WHATSAPP_CERTIFICATE_TEMPLATE with four body parameters: deductor name, certificate (for example
 * "TDS certificate Q2 2026-27"), download link, and the date the link stops working. The token
 * and phone number are the ones integrations/whatsapp.ts uses (WHATSAPP_TOKEN,
 * WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_LANG). Only the message goes to Meta, never the PDF.
 */
export interface CertificateWhatsApp {
  sendCertificateLink(toE164: string, params: [string, string, string, string]): Promise<{ id: string }>;
}

const GRAPH = 'https://graph.facebook.com/v21.0';
const breaker = new CircuitBreaker({ name: 'WhatsApp certificates', failureThreshold: 5, resetTimeoutMs: 60_000, timeoutMs: 15_000 });

export function certificateWhatsAppFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): CertificateWhatsApp | null {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const template = env.WHATSAPP_CERTIFICATE_TEMPLATE?.trim();
  if (!token || !phoneId || !/^\d+$/.test(phoneId) || !template) return null;
  return {
    async sendCertificateLink(toE164, params) {
      const to = toE164.replace(/^\+/, '');
      if (!/^91[6-9]\d{9}$/.test(to)) throw new Error('WhatsApp messages go to Indian mobile numbers only.');
      const text = (s: string) => s.replace(/[\r\n\t]+/g, '; ').replace(/ {4,}/g, ' ').slice(0, 1000);
      const r = await breaker.execute(() =>
        fetchFn(`${GRAPH}/${phoneId}/messages`, {
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
        }),
      );
      const b = (await r.json().catch(() => ({}))) as { messages?: { id: string }[] };
      if (!r.ok) throw new Error(`WhatsApp message not sent (${r.status})`);
      return { id: b.messages?.[0]?.id ?? '' };
    },
  };
}
