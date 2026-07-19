/**
 * Tier 3 — the deterministic engine.
 *
 * This is the floor of the resilience stack: pure functions over the seed policy data
 * with no network calls and no API key. It exists for three reasons:
 *
 *  1. The demo cannot die. A cold start, a rate limit, or venue wifi never blanks the UI.
 *  2. The test suite runs with zero credentials, so CI needs no secrets.
 *  3. It is the honest fallback — it returns real rules from real data, never a
 *     fabricated answer dressed up as one.
 *
 * Every function here is synchronous and side-effect free.
 */

import { allAliases, findVenue, policiesForVenue } from './policies';
import type { AccessGuidance, AccessProfile, CheckResponse, ItemVerdict, Mode, PolicyRule } from './types';

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

/** Languages we surface by name in the "Detected" chip. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  ar: 'العربية',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  hi: 'हिन्दी',
  ru: 'Русский',
};

/** Scripts that identify a language unambiguously from a single character range. */
const SCRIPT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['ar', /[؀-ۿ]/],
  ['ja', /[぀-ヿ]/],
  ['ko', /[가-힯]/],
  ['zh', /[一-鿿]/],
  ['hi', /[ऀ-ॿ]/],
  ['ru', /[Ѐ-ӿ]/],
];

/**
 * Marker words for Latin-script languages.
 *
 * Deliberately short and high-signal. This is a heuristic for the offline tier —
 * the LLM tiers do proper detection. Ordering matters only in that more distinctive
 * markers earn more weight through frequency of match.
 */
const LATIN_MARKERS: Readonly<Record<string, readonly string[]>> = {
  es: ['puedo', 'llevar', 'está', 'dónde', 'gracias', 'entrada', 'permitido', 'silla'],
  pt: ['posso', 'levar', 'onde', 'obrigado', 'entrada', 'permitido', 'bandeira', 'mastro'],
  fr: ['puis', 'apporter', 'où', 'merci', 'entrée', 'autorisé', 'drapeau', 'fauteuil'],
  de: ['kann', 'mitbringen', 'wo', 'danke', 'eingang', 'erlaubt', 'fahne', 'rollstuhl'],
  it: ['posso', 'portare', 'dove', 'grazie', 'ingresso', 'consentito', 'bandiera'],
  nl: ['mag', 'meenemen', 'waar', 'dank', 'ingang', 'toegestaan', 'vlag'],
};

/**
 * Detect the language of a free-text query.
 *
 * Non-Latin scripts resolve by character range. Latin-script languages resolve by
 * marker-word count, defaulting to English when nothing scores.
 *
 * @param text Raw user input.
 * @returns A language code and its display name.
 */
export function detectLanguage(text: string): { language: string; languageName: string } {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { language: 'en', languageName: LANGUAGE_NAMES.en };

  for (const [code, pattern] of SCRIPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { language: code, languageName: LANGUAGE_NAMES[code] };
    }
  }

  const lower = trimmed.toLowerCase();
  let best = 'en';
  let bestScore = 0;
  for (const [code, markers] of Object.entries(LATIN_MARKERS)) {
    const score = markers.reduce((acc, m) => (lower.includes(m) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  // The fallback guards a future marker language added without a display name. Every
  // current `LATIN_MARKERS` key has one — asserted in the deterministic suite — so the
  // right-hand branch is intentionally unreached.
  /* v8 ignore next */
  return { language: best, languageName: LANGUAGE_NAMES[best] ?? LANGUAGE_NAMES.en };
}

// ---------------------------------------------------------------------------
// Item matching
// ---------------------------------------------------------------------------

/** Minimum alias length eligible for substring matching, to avoid noise like "id". */
const MIN_ALIAS_LENGTH = 3;

/**
 * Find policy rules whose item name or aliases appear in the text.
 *
 * Longer matches win, so "flag with pole" beats the bare "flag" rule when both appear.
 *
 * @param text Free-text query, any language (matching is on Latin item names).
 * @param venue Venue whose rule set to search.
 */
export function matchRules(text: string, venue: string): PolicyRule[] {
  const lower = (text ?? '').toLowerCase();
  if (!lower.trim()) return [];

  const scored: Array<{ rule: PolicyRule; weight: number }> = [];
  for (const rule of policiesForVenue(venue)) {
    // Guards future data entry: a one- or two-character alias would match inside
    // unrelated words and fire constantly. No seed alias is that short today — the
    // `policies` suite asserts this — so the reject branch is intentionally unreached.
    /* v8 ignore next */
    const candidates = allAliases(rule).filter((c) => c.length >= MIN_ALIAS_LENGTH);
    let weight = 0;
    for (const candidate of candidates) {
      if (lower.includes(candidate.toLowerCase())) {
        weight = Math.max(weight, candidate.length);
      }
    }
    if (weight > 0) scored.push({ rule, weight });
  }

  scored.sort((a, b) => b.weight - a.weight);

  // Drop a rule when a longer-matching rule in the same category already won,
  // so "flag with pole" suppresses "flag without pole".
  const seenCategories = new Set<string>();
  const result: PolicyRule[] = [];
  for (const { rule } of scored) {
    const key = `${rule.category}:${rule.item.split(' ')[0]}`;
    if (seenCategories.has(key)) continue;
    seenCategories.add(key);
    result.push(rule);
  }
  return result;
}

/** Convert a policy rule into a user-facing verdict. */
export function ruleToVerdict(rule: PolicyRule): ItemVerdict {
  return {
    label: rule.item,
    verdict: rule.verdict,
    reason: rule.reason,
    condition: rule.condition,
    fix: rule.fix,
    sourceRuleId: rule.ruleId,
  };
}

/**
 * The safe answer when nothing matches.
 *
 * Returning `check_with_staff` rather than guessing is the core safety behaviour —
 * an unmatched item is an unknown, and unknowns go to a human.
 */
export function unknownVerdict(label: string): ItemVerdict {
  return {
    label,
    verdict: 'check_with_staff',
    reason: 'No published rule matched this item, so it needs a human decision.',
    fix: 'Ask a volunteer at the gate, or contact venue guest services before match day.',
    sourceRuleId: null,
  };
}

// ---------------------------------------------------------------------------
// Accessibility guidance
// ---------------------------------------------------------------------------

/** Extra notes contributed by each accessibility profile. */
const PROFILE_NOTES: Readonly<Record<AccessProfile, string>> = {
  wheelchair: 'Step-free entry and a companion seat are reserved at the accessible gate.',
  ambulatory: 'Shorter queue and seating close to the concourse are available on request.',
  sensory: 'A quiet room is available if the crowd noise becomes overwhelming.',
  medical_device: 'Use the medical lane so your equipment is not delayed at general screening.',
  service_animal: 'Trained service animals enter with you; a relief area is signposted near the gate.',
  companion: 'Companion seating is allocated beside each accessible position.',
};

/** Build a Google Maps directions link. URL-spec only — no API key, no billing. */
export function buildMapsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/**
 * Build a Google Calendar event link. URL-spec only — no OAuth, no API key.
 *
 * @param title Event title.
 * @param startUtc Event start as `YYYYMMDDTHHMMSSZ`.
 * @param endUtc Event end as `YYYYMMDDTHHMMSSZ`.
 * @param details Body text.
 * @param location Venue location string.
 */
export function buildCalendarUrl(
  title: string,
  startUtc: string,
  endUtc: string,
  details: string,
  location: string,
): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startUtc}/${endUtc}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Assemble accessibility routing for a venue and set of profiles. */
export function buildAccessGuidance(venueName: string, profiles: AccessProfile[]): AccessGuidance {
  const venue = findVenue(venueName);
  const usesMedicalLane = profiles.includes('medical_device');
  return {
    gate: usesMedicalLane ? venue.medicalLaneGate : venue.accessibleGate,
    elevatorRoute: venue.elevatorRoute,
    companionSeating: venue.companionSeating,
    quietRoom: venue.quietRoom,
    mapsUrl: buildMapsUrl(venue.mapsDestination),
    notes: profiles.map((p) => PROFILE_NOTES[p]).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Staff script
// ---------------------------------------------------------------------------

/** Compose a read-aloud script so a volunteer can relay verdicts without training. */
export function buildStaffScript(items: ItemVerdict[], venueName: string): string {
  const venue = findVenue(venueName);
  const lines: string[] = [];
  for (const item of items) {
    if (item.verdict === 'allowed') {
      lines.push(`✅ ${item.label}: fine to bring in.`);
    } else if (item.verdict === 'not_allowed') {
      lines.push(`❌ ${item.label}: cannot come in. ${item.fix ?? `Bag check at ${venue.bagCheckLocation}.`}`);
    } else {
      lines.push(`⚠️ ${item.label}: send to ${venue.medicalLaneGate} for a staff decision.`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Answer a query using only local data.
 *
 * @param query Free-text question in any language.
 * @param venueName Venue to evaluate against.
 * @param mode Which audience view is asking.
 * @param profiles Accessibility profiles, used in `access` mode.
 */
export function deterministicCheck(
  query: string,
  venueName: string,
  mode: Mode = 'fan',
  profiles: AccessProfile[] = [],
): CheckResponse {
  const venue = findVenue(venueName);
  const { language, languageName } = detectLanguage(query);
  const rules = matchRules(query, venue.venue);

  const items: ItemVerdict[] =
    rules.length > 0
      ? rules.map(ruleToVerdict)
      : [unknownVerdict(query.trim().slice(0, 60) || 'your item')];

  const response: CheckResponse = {
    items,
    language,
    languageName,
    venue: venue.venue,
    mode,
    tier: 'deterministic',
  };

  if (mode === 'access') {
    response.accessGuidance = buildAccessGuidance(venue.venue, profiles);
  }
  if (mode === 'staff') {
    response.staffScript = buildStaffScript(items, venue.venue);
  }
  return response;
}
