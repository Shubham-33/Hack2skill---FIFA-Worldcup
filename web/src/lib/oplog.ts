/**
 * Operational aggregation — the data behind the Ops view.
 *
 * This is the product's differentiator: the operational intelligence is a byproduct of
 * real usage, not a simulated feed. Every number shown to an organiser traces back to a
 * question a fan actually asked.
 *
 * Privacy is structural, not procedural:
 *  - Only the matched canonical item label is stored, never the user's raw text.
 *  - Counts are aggregated on write; no per-request row is retained.
 *  - No identifiers of any kind — no IP, no user agent, no session, no cookie.
 * There is therefore nothing here that could surface an individual, by construction.
 *
 * Storage is process-local and intentionally ephemeral. On a serverless platform each
 * instance holds its own tallies, which is honest for a demo and avoids implying a
 * durability guarantee the deployment cannot make.
 */

import { POLICIES } from './policies';
import type { CheckResponse, ItemVerdict, Verdict } from './types';

/** Rule lookup, used to resolve localised labels back to a canonical item name. */
const RULES_BY_ID = new Map(POLICIES.map((r) => [r.ruleId, r]));

/**
 * Resolve the tally key for an item.
 *
 * Aggregating on the model's label fragments the counts by language — "backpack",
 * "mochila" and "sac à dos" are the same operational signal but would appear as three
 * separate rows, so nothing ever crosses the threshold to become a suggestion. Keying on
 * the cited rule's canonical item name collapses them correctly.
 *
 * Unmatched items have no rule, so they fall back to the raw label. They are already
 * `check_with_staff` by construction and are useful to an operator precisely because
 * they reveal gaps in the published policy.
 */
function canonicalItem(item: ItemVerdict): { item: string; category: string } {
  if (item.sourceRuleId) {
    const rule = RULES_BY_ID.get(item.sourceRuleId);
    if (rule) return { item: rule.item, category: rule.category };
  }
  return { item: item.label.toLowerCase(), category: 'unmatched' };
}

/** One aggregated tally row. */
export interface OpsRow {
  venue: string;
  item: string;
  verdict: Verdict;
  category: string;
  count: number;
  /** Epoch ms of the most recent occurrence. */
  lastSeen: number;
}

/** Aggregated counters keyed by `venue|item|verdict`. */
const tallies = new Map<string, OpsRow>();

/** Language counters, used to show the multilingual reach of real traffic. */
const languageTallies = new Map<string, number>();

/** Cap on distinct tally keys, bounding memory on a long-running instance. */
const MAX_TALLY_KEYS = 5_000;

/**
 * Record the outcome of a request.
 *
 * Accepts the assembled response rather than the request, which is what makes the
 * privacy guarantee structural: the raw query is not in scope here and cannot be logged
 * even by mistake.
 */
export async function recordQuestions(response: CheckResponse): Promise<void> {
  const now = Date.now();

  for (const entry of response.items) {
    if (tallies.size >= MAX_TALLY_KEYS) break;
    const { item, category } = canonicalItem(entry);
    const key = `${response.venue}|${item}|${entry.verdict}`;
    const existing = tallies.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
    } else {
      tallies.set(key, {
        venue: response.venue,
        item,
        verdict: entry.verdict,
        category,
        count: 1,
        lastSeen: now,
      });
    }
  }

  // Normalise casing so "español" and "Español" are not counted as two languages.
  const language = response.languageName.trim();
  const normalised = language.charAt(0).toLocaleUpperCase() + language.slice(1);
  languageTallies.set(normalised, (languageTallies.get(normalised) ?? 0) + 1);
}

/** Snapshot of the tallies, most frequent first. */
export function getOpsSnapshot(): {
  rows: OpsRow[];
  languages: Array<{ language: string; count: number }>;
  totalQuestions: number;
} {
  const rows = [...tallies.values()].sort((a, b) => b.count - a.count);
  const languages = [...languageTallies.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);
  const totalQuestions = rows.reduce((acc, r) => acc + r.count, 0);
  return { rows, languages, totalQuestions };
}

/**
 * Derive operator-facing suggestions from the tallies.
 *
 * Deliberately conservative: a suggestion only appears once an item has been asked about
 * enough times to be a genuine signal rather than noise.
 */
export function getSuggestions(minCount = 3): string[] {
  const { rows } = getOpsSnapshot();
  const suggestions: string[] = [];

  for (const row of rows) {
    if (row.count < minCount) continue;
    if (row.verdict === 'not_allowed') {
      suggestions.push(
        `${row.count} fans asked about "${row.item}" at ${row.venue} — it is not permitted. ` +
          `Post signage at the approach and staff the bag check.`,
      );
    } else if (row.verdict === 'check_with_staff') {
      suggestions.push(
        `${row.count} fans asked about "${row.item}" at ${row.venue} — this needs a human decision. ` +
          `Brief the medical lane and consider publishing a clarification.`,
      );
    }
  }
  return suggestions.slice(0, 6);
}

/** Reset all counters. Exported for test isolation. */
export function resetOpsLog(): void {
  tallies.clear();
  languageTallies.clear();
}
