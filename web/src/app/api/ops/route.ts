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
import { activeRuleCount, isUsingLiveSheet, refreshPolicies } from '@/lib/sheets';

export async function GET(): Promise<NextResponse> {
  await refreshPolicies();
  const snapshot = getOpsSnapshot();

  return NextResponse.json(
    {
      ...snapshot,
      suggestions: getSuggestions(),
      // Where the rules being served came from. An operator needs to know whether the
      // policy they just edited is actually in force, and it makes the integration
      // verifiable from outside rather than merely asserted.
      policySource: {
        live: isUsingLiveSheet(),
        source: isUsingLiveSheet() ? 'google-sheet' : 'built-in',
        ruleCount: activeRuleCount(),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
