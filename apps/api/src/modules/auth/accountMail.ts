import type { FastifyRequest } from 'fastify';
import { sesMailerFromEnv, type Mailer } from '../../integrations/mail.js';

/**
 * Account email: invitation links and password reset codes. Mail goes through SES when it is
 * configured (MAIL_FROM, SES_REGION and the AWS keys); otherwise invitations hand the link back to
 * the partner to send, and reset codes cannot be delivered.
 */
let override: Mailer | null | undefined;

/** Tests replace the mailer to read what would have been sent. Pass undefined to go back to SES. */
export function setAccountMailerForTests(m: Mailer | null | undefined): void {
  override = m;
}

export function accountMailer(): Mailer | null {
  return override !== undefined ? override : sesMailerFromEnv();
}

/** Where links in emails point: APP_URL in production, else the caller's origin in development. */
export function appOrigin(req: FastifyRequest): string {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  const origin = req.headers.origin;
  return typeof origin === 'string' && /^https?:\/\/[^\s/]+$/.test(origin) ? origin : 'http://localhost:3000';
}

const ROLE_PHRASE: Record<string, string> = { MANAGER: 'a manager', STAFF: 'a team member', CLIENT: 'a client contact' };

export function invitationEmail(input: { to: string; name: string; firmName: string; role: string; link: string; hours: number }) {
  return {
    to: input.to,
    subject: `${input.firmName} invited you to SynexTax`,
    text: [
      `Hello ${input.name},`,
      '',
      `${input.firmName} has invited you to SynexTax as ${ROLE_PHRASE[input.role] ?? 'a member'}.`,
      `Open this link to choose a password and set up your authenticator app. It works once and for ${input.hours} hours:`,
      '',
      input.link,
      '',
      'If you were not expecting this, ignore this email and nothing happens.',
    ].join('\n'),
  };
}

export function resetCodeEmail(input: { to: string; code: string; minutes: number }) {
  return {
    to: input.to,
    subject: 'Your SynexTax password reset code',
    text: [
      `Your code to reset your SynexTax password is ${input.code}.`,
      `It works once and for ${input.minutes} minutes. You will also need a code from your authenticator app.`,
      '',
      'If you did not ask for this, ignore this email; your password stays as it is.',
    ].join('\n'),
  };
}
