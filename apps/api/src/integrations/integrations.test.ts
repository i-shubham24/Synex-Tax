import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S3FileStore, s3StoreFromEnv } from './s3Store.js';
import { sesMailerFromEnv } from './mail.js';
import { whatsappFromEnv } from './whatsapp.js';
import { bedrockFromEnv } from './bedrock.js';

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: (c: Call) => Response) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL, init: RequestInit = {}) => {
    const c = { url: String(url), init };
    calls.push(c);
    return respond(c);
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const AWS = { AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE', AWS_SECRET_ACCESS_KEY: 'secret' };
const KEY = '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333.pdf';

test('S3 store: Mumbai bucket, signed, encrypted, never overwrites', async () => {
  assert.equal(s3StoreFromEnv({ ...AWS, S3_BUCKET: 'synextax-docs', S3_REGION: 'us-east-1' }), null);
  assert.ok(s3StoreFromEnv({ ...AWS, S3_BUCKET: 'synextax-docs', S3_REGION: 'ap-south-1' }));
  const f = fakeFetch((c) => new Response(c.init.method === 'PUT' ? '' : 'file', { status: 200 }));
  const s = new S3FileStore('synextax-docs', 'ap-south-1', { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' }, f.fn);
  await s.put(KEY, Buffer.from('%PDF-1.7'));
  const put = f.calls[0];
  assert.equal(put.url, `https://synextax-docs.s3.ap-south-1.amazonaws.com/${KEY}`);
  const h = put.init.headers as Record<string, string>;
  assert.match(h.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/ap-south-1\/s3\/aws4_request, SignedHeaders=content-type;host;if-none-match;x-amz-content-sha256;x-amz-date;x-amz-server-side-encryption, Signature=[0-9a-f]{64}$/);
  assert.deepEqual([h['x-amz-server-side-encryption'], h['if-none-match']], ['AES256', '*']);
  assert.equal((await s.get(KEY)).toString(), 'file');
  await assert.rejects(s.put('../etc/passwd', Buffer.from('x')), /Invalid storage key/);
});

test('mail: SES v2 in India only', async () => {
  assert.equal(sesMailerFromEnv({ ...AWS, MAIL_FROM: 'office@example.in', SES_REGION: 'eu-west-1' }), null);
  const f = fakeFetch(() => Response.json({ MessageId: 'm-1' }));
  const m = sesMailerFromEnv({ ...AWS, MAIL_FROM: 'office@example.in', SES_REGION: 'ap-south-1' }, f.fn)!;
  assert.deepEqual(await m.send({ to: 'client@example.com', subject: 'Documents needed', text: 'Please send' }), { id: 'm-1' });
  assert.equal(f.calls[0].url, 'https://email.ap-south-1.amazonaws.com/v2/email/outbound-emails');
  const body = JSON.parse(String(f.calls[0].init.body));
  assert.deepEqual([body.FromEmailAddress, body.Destination.ToAddresses[0], body.Content.Simple.Body.Text.Data], ['office@example.in', 'client@example.com', 'Please send']);
  await assert.rejects(m.send({ to: 'not-an-email', subject: 's', text: 't' }));
});

test('WhatsApp: approved template with five parameters, Indian mobiles only', async () => {
  const f = fakeFetch(() => Response.json({ messages: [{ id: 'wamid.1' }] }));
  const w = whatsappFromEnv({ WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_REMINDER_TEMPLATE: 'doc_reminder' }, f.fn)!;
  await w.sendReminder('+919876543210', ['Asha', 'Oct 2026', 'Sales register\nPurchase bills', '2026-11-11', 'Verma & Co']);
  const body = JSON.parse(String(f.calls[0].init.body));
  assert.equal(body.to, '919876543210');
  assert.equal(body.template.name, 'doc_reminder');
  assert.equal(body.template.components[0].parameters[2].text, 'Sales register; Purchase bills');
  await assert.rejects(w.sendReminder('+14155550100', ['a', 'b', 'c', 'd', 'e']), /Indian mobile/);
});

test('assistant: Bedrock in India, identifiers never leave, answer restored', async () => {
  assert.equal(bedrockFromEnv({ ...AWS, BEDROCK_REGION: 'ap-south-1', BEDROCK_MODEL_ID: 'global.anthropic.model-v1:0' }), null);
  assert.equal(bedrockFromEnv({ ...AWS, BEDROCK_REGION: 'us-east-1', BEDROCK_MODEL_ID: 'anthropic.model-v1:0' }), null);
  const f = fakeFetch((c) => {
    const sent = JSON.parse(String(c.init.body)).messages[0].content[0].text as string;
    return Response.json({ output: { message: { content: [{ text: `Fix the PAN ${sent.match(/\[PAN_1\]/)?.[0]} in row 4.` }] } } });
  });
  const a = bedrockFromEnv({ ...AWS, BEDROCK_REGION: 'ap-south-1', BEDROCK_MODEL_ID: 'anthropic.model-v1:0' }, f.fn)!;
  const answer = await a.ask('system', 'Line 4: PAN ABCPV1234K is invalid for TAN DELA12345B');
  const outbound = String(f.calls[0].init.body);
  assert.doesNotMatch(outbound, /ABCPV1234K|DELA12345B/);
  assert.match(f.calls[0].url, /^https:\/\/bedrock-runtime\.ap-south-1\.amazonaws\.com\/model\/anthropic\.model-v1%3A0\/converse$/);
  assert.equal(answer, 'Fix the PAN ABCPV1234K in row 4.');
});
