/**
 * Google Sheets as the live policy database.
 *
 * ## Why CSV export rather than the Sheets API
 *
 * A service account would mean a JSON private key in an environment variable, an extra
 * dependency, and an IAM setup step. A Sheet shared as "anyone with the link can view"
 * is readable at a CSV endpoint with no credentials at all — same result, one fewer
 * secret to leak, and an operations person can grant access without touching a console.
 *
 * The tradeoff is honest and stated: the Sheet is world-readable. That is appropriate
 * here because venue gate policy is public information by nature — it is printed on
 * signage at the gate. Nothing private is ever placed in it.
 *
 * ## Why this matters to the product
 *
 * Gate policy changes. Without this, a corrected rule needs a code change and a
 * redeploy; with it, an operations lead edits a spreadsheet and the change is live
 * within the cache TTL. That is the difference between a demo and something a venue
 * could actually run.
 *
 * ## Failure behaviour
 *
 * Every failure path falls back to the in-repo seed data: no `GOOGLE_SHEETS_ID`, an
 * unreachable Sheet, a non-2xx response, malformed CSV, or a sheet with no usable rows.
 * The app is never worse off for the Sheet being broken, which is what makes it safe to
 * depend on during a live event.
 */

import { getActivePolicies, setLivePolicies } from './policies';
import type { PolicyRule, Verdict } from './types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** How long fetched rows are trusted before a refresh is attempted. */
const CACHE_TTL_MS = 60_000;

/** Time box on the Sheet fetch. A slow Sheet must never delay a fan's answer. */
const FETCH_TIMEOUT_MS = 5_000;

/** Tab within the spreadsheet holding item rules. */
const POLICY_SHEET_NAME = 'policies';

const VALID_VERDICTS: readonly Verdict[] = ['allowed', 'not_allowed', 'check_with_staff'];

/** Epoch ms of the last completed refresh attempt, successful or not. */
let lastAttemptAt = 0;

/** Whether the most recent refresh actually produced live rows. */
let usingLiveData = false;

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Parse CSV into rows of cells.
 *
 * Hand-rolled rather than pulled from npm because the requirement is small and fully
 * specified: quoted fields, escaped quotes (`""`), embedded commas and newlines, and
 * CRLF line endings. A dependency here would be more surface area than code.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/**
 * Convert CSV rows into policy rules.
 *
 * Columns are resolved by header name rather than position, so an operations person can
 * reorder or add columns in the Sheet without breaking the app. Rows missing a rule id,
 * item, or recognised verdict are skipped rather than allowed to produce a malformed
 * verdict — a bad row must never become a wrong answer at a gate.
 */
export function rowsToPolicies(rows: string[][]): PolicyRule[] {
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);

  const idIdx = col('rule_id');
  const itemIdx = col('item');
  const verdictIdx = col('verdict');
  if (idIdx === -1 || itemIdx === -1 || verdictIdx === -1) return [];

  const venueIdx = col('venue');
  const aliasesIdx = col('aliases');
  const conditionIdx = col('condition');
  const reasonIdx = col('reason');
  const fixIdx = col('fix');
  const categoryIdx = col('category');

  const at = (row: string[], idx: number): string => (idx === -1 ? '' : (row[idx] ?? '').trim());

  const rules: PolicyRule[] = [];
  for (const row of rows.slice(1)) {
    const ruleId = at(row, idIdx);
    const item = at(row, itemIdx);
    const verdict = at(row, verdictIdx).toLowerCase() as Verdict;

    if (!ruleId || !item || !VALID_VERDICTS.includes(verdict)) continue;

    const aliases = at(row, aliasesIdx)
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    rules.push({
      ruleId,
      venue: at(row, venueIdx) || 'ALL',
      item: item.toLowerCase(),
      aliases,
      verdict,
      condition: at(row, conditionIdx) || undefined,
      reason: at(row, reasonIdx) || 'No reason published for this rule.',
      fix: at(row, fixIdx) || undefined,
      category: at(row, categoryIdx) || 'general',
    });
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/** CSV endpoint for a link-shared spreadsheet tab. No credentials required. */
export function buildSheetCsvUrl(sheetId: string, sheetName = POLICY_SHEET_NAME): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

/**
 * Refresh policy rules from the configured Sheet.
 *
 * Safe to call on every request: it is a no-op while the cache is warm, and it never
 * throws — a failure simply leaves the seed data in place.
 *
 * @param force Bypass the TTL. Used by tests; not on the request path.
 */
export async function refreshPolicies(force = false): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) return;

  const now = Date.now();
  if (!force && now - lastAttemptAt < CACHE_TTL_MS) return;
  lastAttemptAt = now;

  try {
    const res = await fetch(buildSheetCsvUrl(sheetId), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Vercel caches fetches by default; policy edits must not be masked by that.
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Sheet ${res.status}`);

    const rules = rowsToPolicies(parseCsv(await res.text()));
    if (rules.length === 0) throw new Error('Sheet produced no usable rules');

    setLivePolicies(rules);
    usingLiveData = true;
  } catch {
    // Deliberately silent: the seed data remains active and the request proceeds.
    // A broken Sheet degrades freshness, never availability.
    usingLiveData = false;
  }
}

/** Whether answers are currently served from live Sheet rows. Surfaced for diagnostics. */
export function isUsingLiveSheet(): boolean {
  return usingLiveData;
}

/** Reset cache state. Exported for test isolation. */
export function resetSheetCache(): void {
  lastAttemptAt = 0;
  usingLiveData = false;
  setLivePolicies(null);
}

/** Number of rules currently in force, live or seed. Surfaced for diagnostics. */
export function activeRuleCount(): number {
  return getActivePolicies().length;
}
