import { NextRequest, NextResponse } from 'next/server';

/**
 * Content Security Policy with a fresh nonce on every page request. Scripts run only when they
 * carry the nonce (Next.js adds it to its own scripts) or were loaded by such a script
 * ('strict-dynamic'), so an injected <script> or inline handler does not run. Pages render per
 * request for this (the root layout waits for the connection).
 *
 * Styles keep 'unsafe-inline': server-rendered style attributes cannot carry a nonce, and styles
 * cannot run code.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    // wasm-unsafe-eval lets WebAssembly compile (pdf.js image decoders, OCR); it does not allow eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    // pdf.js and OCR workers, served from /vendor on this site.
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // The desktop agent on this computer; the local API and dev-server sockets only in development.
    `connect-src 'self' http://127.0.0.1:18531 https://127.0.0.1:18531 http://localhost:18531${isDev ? ' http://localhost:4000 http://127.0.0.1:4000 ws://localhost:3000 ws://127.0.0.1:3000' : ''}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
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
