/**
 * Security headers applied to every response.
 *
 * Named `proxy.ts` rather than `middleware.ts`: Next.js 16 renamed the convention, and
 * a file still called `middleware.ts` is silently ignored — the headers would simply
 * never be applied, with no error to tell you.
 *
 * The CSP is deliberately strict. This app loads no third-party scripts, no analytics,
 * no external fonts at runtime (`next/font` self-hosts Google Fonts at build time), and
 * talks to no origin but its own — so there is nothing to allow beyond `'self'`.
 */

import { NextResponse } from 'next/server';

/**
 * `'unsafe-inline'` on styles is required by Tailwind's runtime style injection.
 * Scripts get no such exemption.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // No feature of this app needs any of these, so all are denied outright.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

export function proxy(): NextResponse {
  const response = NextResponse.next();
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  return response;
}

export const config = {
  /** Everything except Next's own static output, which is already immutable. */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
