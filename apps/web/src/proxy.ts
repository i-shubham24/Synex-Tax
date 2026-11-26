import { NextRequest, NextResponse } from 'next/server';

/**
 * Content Security Policy.
 *
 * Signed-in areas (the workspace and the client portal) get a fresh nonce on every request: scripts
 * run only when they carry it (Next.js adds it to its own scripts) or were loaded by such a script
 * ('strict-dynamic'), so an injected <script> or inline handler does not run there. Those pages
 * render per request for this (their layouts wait for the connection).
 *
 * Public pages (home, login, sign-up, features, legal, tools) are prebuilt so they open fast; a
 * prebuilt page cannot carry a per-request nonce, so their scripts are limited to this site with
 * inline allowed. They hold no client data.
 *
 * Styles keep 'unsafe-inline': server-rendered style attributes cannot carry a nonce, and styles
 * cannot run code.
 */

/** First path segments of the pages that render per request (app/(workspace) and app/client). */
const SIGNED_IN = new Set([
  'dashboard', 'clients', 'gst', 'tds', 'itr', 'tax-audit', 'practice', 'documents', 'bank', 'audit',
  'settings', 'messages', 'assistant', 'client', 'billing', 'dsc',
]);

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  const signedIn = SIGNED_IN.has(request.nextUrl.pathname.split('/')[1] ?? '');
  const nonce = signedIn ? Buffer.from(crypto.randomUUID()).toString('base64') : null;
  const scripts = nonce ? `'nonce-${nonce}' 'strict-dynamic'` : "'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    // wasm-unsafe-eval lets WebAssembly compile (pdf.js image decoders, OCR); it does not allow eval.
    `script-src 'self' ${scripts} 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    // pdf.js and OCR workers, served from /vendor on this site.
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // The desktop agent on this computer (port 15850 and legacy 18531); the local API and dev-server sockets only in development.
    `connect-src 'self' http://127.0.0.1:15850 https://127.0.0.1:15850 http://localhost:15850 https://localhost:15850 http://127.0.0.1:18531 https://127.0.0.1:18531 http://localhost:18531${isDev ? ' http://localhost:4000 http://127.0.0.1:4000 ws://localhost:3000 ws://127.0.0.1:3000' : ''}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API, static files, images or prefetches.
      source: '/((?!api|health|vendor|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
