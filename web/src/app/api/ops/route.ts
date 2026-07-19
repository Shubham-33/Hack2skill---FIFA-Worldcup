/**
 * `GET /api/ops` — aggregated operational intelligence.
 *
 * Every number returned here traces back to a question a fan actually asked this tool.
 * Nothing is simulated, which is precisely what makes it credible: we have no turnstile
 * telemetry and do not pretend to.
 *
 * The payload is aggregate-only by construction — see `lib/oplog` for why no individual
 * can be surfaced from it.
 */

import { NextResponse } from 'next/server';

import { getOpsSnapshot, getSuggestions } from '@/lib/oplog';

export async function GET(): Promise<NextResponse> {
  const snapshot = getOpsSnapshot();
  return NextResponse.json(
    { ...snapshot, suggestions: getSuggestions() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
