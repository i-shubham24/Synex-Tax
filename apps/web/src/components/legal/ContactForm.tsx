'use client';

import { useState } from 'react';
import { PillButton } from '../landing/primitives';
import { LEGAL } from '../../lib/legal';

const TOPICS = ['Book a demo', 'Pricing', 'Moving from another software', 'Support', 'Privacy'] as const;
const LANGS = [
  ['en', 'English'],
  ['pa', 'ਪੰਜਾਬੀ'],
  ['hi', 'हिन्दी'],
] as const;

const field =
  'h-12 w-full rounded-full border border-ink/10 bg-white px-5 text-[15px] text-ink outline-none transition-shadow placeholder:text-ink/35 focus:border-sky focus:shadow-[0_0_0_4px_rgba(82,176,248,0.18)]';

/**
 * No message leaves the browser from here: the form composes an email in the visitor's own mail app.
 * Swap for an API endpoint once the contact desk exists.
 */
export function ContactForm() {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>('Book a demo');
  const [lang, setLang] = useState<string>('en');
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const firm = String(data.get('firm') ?? '').trim();
    const mobile = String(data.get('mobile') ?? '').replace(/\D/g, '').slice(-10);
    const message = String(data.get('message') ?? '').trim();
    if (!name || !message) {
      setError('Add your name and a short message.');
      return;
    }
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) {
      setError('Mobile numbers have 10 digits and start with 6, 7, 8 or 9.');
      return;
    }
    setError(null);
    const language = LANGS.find(([code]) => code === lang)?.[1] ?? 'English';
    const body = [
      message,
      '',
      `Name: ${name}`,
      firm && `Firm: ${firm}`,
      mobile && `Mobile: +91 ${mobile}`,
      `Preferred language: ${language}`,
    ]
      .filter(Boolean)
      .join('\n');
    const to = topic === 'Support' ? LEGAL.emails.support : topic === 'Privacy' ? LEGAL.emails.privacy : LEGAL.emails.hello;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(`${topic}: ${firm || name}`)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <fieldset>
        <legend className="mb-2.5 text-[13px] font-medium text-ink/55">What is it about?</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              aria-pressed={topic === t}
              className={`rounded-full border px-4 py-2 text-[13.5px] transition-colors ${
                topic === t ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white text-ink/70 hover:border-ink/30'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="sr-only">Your name</span>
          <input name="name" autoComplete="name" placeholder="Your name" className={field} required />
        </label>
        <label className="block">
          <span className="sr-only">Firm or business</span>
          <input name="firm" autoComplete="organization" placeholder="Firm or business" className={field} />
        </label>
        <label className="block">
          <span className="sr-only">Mobile number</span>
          <input name="mobile" inputMode="tel" autoComplete="tel-national" placeholder="Mobile (optional)" className={field} />
        </label>
        <div className="flex h-12 items-center gap-1 rounded-full border border-ink/10 bg-white p-1" role="radiogroup" aria-label="Preferred language">
          {LANGS.map(([code, label]) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={lang === code}
              onClick={() => setLang(code)}
              className={`h-full flex-1 rounded-full text-[13.5px] transition-colors ${lang === code ? 'bg-sky-subtle font-medium text-sky-deep' : 'text-ink/60 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="sr-only">Message</span>
        <textarea
          name="message"
          rows={5}
          placeholder="How many clients do you file for, and what would you like to see?"
          className="w-full resize-none rounded-[24px] border border-ink/10 bg-white px-5 py-4 text-[15px] leading-[1.55] text-ink outline-none transition-shadow placeholder:text-ink/35 focus:border-sky focus:shadow-[0_0_0_4px_rgba(82,176,248,0.18)]"
          required
        />
      </label>

      {error && (
        <p role="alert" className="text-[13.5px] text-[#dc2626]">
          {error}
        </p>
      )}
      {opened && !error && (
        <p role="status" className="text-[13.5px] text-ink/60">
          Your email app should open with the message ready to send. If it does not, write to {LEGAL.emails.hello}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <PillButton type="submit">Write the email</PillButton>
        <span className="text-[13px] text-ink/45">Opens your email app. Nothing is stored here.</span>
      </div>
    </form>
  );
}
