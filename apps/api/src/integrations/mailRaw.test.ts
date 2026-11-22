import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMime, sesMailerFromEnv } from './mail.js';

const AWS = { AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE', AWS_SECRET_ACCESS_KEY: 'secret' };

test('mail: a message with an attachment goes to SES as raw MIME', async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    return Response.json({ MessageId: 'm-raw' });
  }) as unknown as typeof fetch;
  const m = sesMailerFromEnv({ ...AWS, MAIL_FROM: 'office@example.in', SES_REGION: 'ap-south-1' }, fetchFn)!;
  const pdf = Buffer.from('%PDF-1.7 signed certificate');
  assert.deepEqual(await m.send({ to: 'payee@example.com', subject: 'Form 16A Q2 2026-27', text: 'Attached.', attachments: [{ filename: 'ABCDE1234F_Q2.pdf', contentType: 'application/pdf', content: pdf }] }), { id: 'm-raw' });
  const body = JSON.parse(calls[0].body);
  assert.equal(body.Destination.ToAddresses[0], 'payee@example.com');
  assert.equal(body.Content.Simple, undefined);
  const raw = Buffer.from(body.Content.Raw.Data, 'base64').toString('utf8');
  assert.match(raw, /^From: office@example\.in\r\nTo: payee@example\.com\r\n/);
  assert.match(raw, /Content-Type: multipart\/mixed; boundary="sx_[0-9a-f]{24}"/);
  assert.match(raw, /Content-Disposition: attachment; filename="ABCDE1234F_Q2\.pdf"/);
  assert.ok(raw.includes(pdf.toString('base64')));
  // An address carrying a second header or recipient is refused.
  await assert.rejects(m.send({ to: 'a@b.in\r\nBcc: x@y.in', subject: 's', text: 't', attachments: [] }));
});

test('mail: headers and file names cannot inject lines; non-ASCII subjects are encoded', () => {
  const raw = buildMime('office@example.in', { to: 'p@example.com', subject: 'Certificate\r\nBcc: evil@example.com ₹', text: 'x', attachments: [{ filename: 'a"\r\nX-Evil: 1.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-') }] }, 'b1');
  assert.ok(!/\r\nBcc:/.test(raw));
  assert.ok(!/\r\nX-Evil:/.test(raw));
  assert.match(raw, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  assert.match(raw, /filename="a_ X-Evil: 1\.pdf"/);
  assert.ok(raw.endsWith('--b1--\r\n'));
});
