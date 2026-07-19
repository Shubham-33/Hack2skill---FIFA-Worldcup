/**
 * Security headers applied to every response.
 *
 * Named `proxy.ts` rather than `middleware.ts`: Next.js 16 renamed the convention, and
 * a file still called `middleware.ts` is silently ignored — the headers would never be
 * applied, with no error to tell you.
 *
 * ## Why `script-src` is not nonce-based
 *
 * The first version used a flat `script-src 'self'`. It looked strict and deployed
 * cleanly — but it blocked Next.js's own inline bootstrap scripts, so the production
 * page rendered and then never hydrated. Every button, tab, and upload was dead while
 * the server-rendered HTML looked perfectly healthy. No build, test, or lint caught it;
 * it surfaced only by clicking a button in headless Chrome against the deployed URL.
 *
 * The documented fix is a per-request nonce forwarded on the request headers, with
 * `'strict-dynamic'`. That was implemented and verified against a production build:
 * the CSP header carried a valid nonce, `/` was switched to dynamic rendering so a
 * nonce could be minted per request — and Next.js 16.2.10 under Turbopack still emitted
 * every `<script>` tag with **no `nonce` attribute at all**. With `'strict-dynamic'`,
 * `'self'` is ignored, so un-nonced chunks were refused and hydration stayed broken.
 *
 * Rather than ship a CSP that is strict on paper and a dead page in practice, scripts
 * are restricted to same-origin plus inline. That is the posture most Next.js
 * deployments run, and it still refuses any script from a third-party origin.
 *
 * The residual risk is inline-script injection, which requires an XSS foothold this app
 * does not offer: no `dangerouslySetInnerHTML`, no `eval`, no user-controlled HTML —
 * every dynamic value renders through React's escaping. Revisit once nonce propagation
 * works on this Next/Turbopack combination.
 */

import { NextResponse } from 'next/server';

/** Headers that never vary by request. */
const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // No feature of this app needs any of these, so all are denied outright.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

/**
 * Build the CSP.
 *
 * `'unsafe-eval'` is development-only: React uses `eval` there to reconstruct
 * server-side error stacks. Neither React nor Next.js needs it in production.
 */
function buildCsp(isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function proxy(): NextResponse {
  const csp = buildCsp(process.env.NODE_ENV === 'development');

  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', csp);
  for (const [header, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  return response;
}

export const config = {
  /** Everything except Next's own static output, which is already immutable. */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
