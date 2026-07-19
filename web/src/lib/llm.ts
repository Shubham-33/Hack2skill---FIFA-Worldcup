/**
 * Tiers 1 and 2 — the LLM layer, with automatic failover.
 *
 * Tier 1 is Gemini 2.5 Flash (multimodal, free tier, counts as a Google service).
 * Tier 2 is NVIDIA NIM `llama-3.2-90b-vision-instruct`, which covers Gemini's ~15 RPM
 * free-tier ceiling during concurrent judging and is itself multimodal, so photo input
 * survives failover intact.
 *
 * Both tiers are grounded: the prompt carries the applicable policy rows and the model
 * is instructed to answer only from them. Anything unmatched must come back as
 * `check_with_staff`. The model classifies and translates; it does not invent policy.
 *
 * Every call is time-boxed. A hanging upstream must never become a hanging request —
 * `meta/llama-3.3-70b-instruct` was observed accepting connections and never responding,
 * which is exactly the failure this guards against.
 */

import { deterministicCheck, buildAccessGuidance, buildStaffScript } from './deterministic';
import { findVenue, getRuleById, policiesForVenue } from './policies';
import type { AccessProfile, CheckResponse, ItemVerdict, Mode, Tier, Verdict } from './types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

/** Time box for tier 1. Generous enough for vision, short enough to still fail over. */
const GEMINI_TIMEOUT_MS = 15_000;
/** Time box for tier 2. Tighter — it is already the fallback path. */
const NVIDIA_TIMEOUT_MS = 8_000;

const VALID_VERDICTS: readonly Verdict[] = ['allowed', 'not_allowed', 'check_with_staff'];

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build the grounding prompt.
 *
 * The policy rows are inlined so the model reasons over real data rather than memory.
 * The instruction to prefer `check_with_staff` over guessing is the safety contract.
 */
export function buildPrompt(query: string, venueName: string, mode: Mode): string {
  const venue = findVenue(venueName);
  const rules = policiesForVenue(venue.venue)
    .map(
      (r) =>
        `${r.ruleId} | ${r.item} (${r.aliases.join(', ')}) | ${r.verdict}` +
        `${r.condition ? ` | condition: ${r.condition}` : ''} | reason: ${r.reason}` +
        `${r.fix ? ` | fix: ${r.fix}` : ''}`,
    )
    .join('\n');

  return [
    'You are GateReady, a stadium gate-policy assistant for the FIFA World Cup 2026.',
    '',
    `Venue: ${venue.venue} (${venue.city})`,
    `Bag check: ${venue.bagCheckLocation} (${venue.bagCheckCost})`,
    `Medical lane: ${venue.medicalLaneGate}. Accessible gate: ${venue.accessibleGate}.`,
    `Mode: ${mode}`,
    '',
    'POLICY RULES (the only source of truth):',
    rules,
    '',
    'RULES OF ENGAGEMENT:',
    '1. Answer ONLY from the policy rules above. Never invent a rule.',
    '2. If no rule clearly covers an item, return verdict "check_with_staff" with',
    '   sourceRuleId null. Never guess — a wrong "allowed" on a medical item is harmful.',
    '3. Detect the language of the user input and write every reason, condition and fix',
    '   in THAT language. Return the language code in `language` and its native name in',
    '   `languageName`.',
    '4. `label` should name the item as the user referred to it, in their language.',
    '5. Set `sourceRuleId` to the exact rule id you used, or null if none applied.',
    '6. Identify every distinct item mentioned or visible, one entry each.',
    '',
    `USER INPUT: ${query || '(see attached image — identify every item visible in the bag)'}`,
  ].join('\n');
}

/** JSON schema constraining Gemini's structured output. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string' },
    languageName: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          verdict: { type: 'string', enum: ['allowed', 'not_allowed', 'check_with_staff'] },
          reason: { type: 'string' },
          condition: { type: 'string' },
          fix: { type: 'string' },
          sourceRuleId: { type: 'string' },
        },
        required: ['label', 'verdict', 'reason'],
      },
    },
  },
  required: ['language', 'languageName', 'items'],
} as const;

// ---------------------------------------------------------------------------
// Parsing and validation
// ---------------------------------------------------------------------------

/** Extract a JSON object from model output that may be fenced or padded with prose. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model output');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Coerce untrusted model output into `ItemVerdict[]`.
 *
 * Anything the model returns that is not a recognised verdict is downgraded to
 * `check_with_staff` rather than trusted — fail safe, not fail open.
 */
export function normaliseItems(parsed: unknown): ItemVerdict[] {
  const root = parsed as { items?: unknown };
  if (!root || !Array.isArray(root.items)) throw new Error('Model output missing items array');

  return root.items.map((entry): ItemVerdict => {
    const e = entry as Record<string, unknown>;
    const verdict = VALID_VERDICTS.includes(e.verdict as Verdict)
      ? (e.verdict as Verdict)
      : 'check_with_staff';
    const sourceRuleId = typeof e.sourceRuleId === 'string' && e.sourceRuleId ? e.sourceRuleId : null;
    return {
      label: typeof e.label === 'string' ? e.label : 'item',
      verdict,
      reason: typeof e.reason === 'string' ? e.reason : 'No reason supplied.',
      condition: typeof e.condition === 'string' ? e.condition : undefined,
      fix: typeof e.fix === 'string' ? e.fix : undefined,
      sourceRuleId,
    };
  });
}

/**
 * Enforce citation integrity.
 *
 * A model can produce a plausible verdict attached to a rule that does not support it —
 * observed in testing when a "smartphone → allowed" verdict cited the *professional
 * camera* rule (verdict `not_allowed`) because that rule's fix text mentioned phones.
 * A citation that contradicts its own rule silently destroys the grounding guarantee,
 * so it is treated as no citation at all.
 *
 * A citation is invalid when it names a rule that does not exist (fabricated) or a rule
 * whose verdict contradicts the one returned. Both cases mean the claim is not supported
 * by the policy data, so both are downgraded to `check_with_staff` with the citation
 * dropped.
 *
 * Fail safe, not fail open: an ungrounded answer becomes a human decision.
 */
export function enforceCitationIntegrity(items: ItemVerdict[]): ItemVerdict[] {
  return items.map((item) => {
    if (!item.sourceRuleId) return item;

    const rule = getRuleById(item.sourceRuleId);
    const grounded = rule !== undefined && rule.verdict === item.verdict;
    if (grounded) return item;

    return {
      ...item,
      verdict: 'check_with_staff',
      sourceRuleId: null,
      reason: 'The published rules do not clearly cover this item, so it needs a human decision.',
      fix: item.fix ?? 'Ask a volunteer at the gate before you join the queue.',
    };
  });
}

/** Split a data URL into its mime type and base64 payload. */
export function splitDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

// ---------------------------------------------------------------------------
// Tier 1 — Gemini
// ---------------------------------------------------------------------------

/** Call Gemini with optional image input. Throws on any non-2xx or timeout. */
export async function callGemini(
  prompt: string,
  apiKey: string,
  imageDataUrl?: string,
): Promise<{ items: ItemVerdict[]; language: string; languageName: string }> {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (imageDataUrl) {
    const image = splitDataUrl(imageDataUrl);
    if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  }

  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');

  const parsed = extractJson(text) as { language?: string; languageName?: string };
  return {
    items: enforceCitationIntegrity(normaliseItems(parsed)),
    language: parsed.language ?? 'en',
    languageName: parsed.languageName ?? 'English',
  };
}

// ---------------------------------------------------------------------------
// Tier 2 — NVIDIA NIM
// ---------------------------------------------------------------------------

/** Call NVIDIA NIM with optional image input. Throws on any non-2xx or timeout. */
export async function callNvidia(
  prompt: string,
  apiKey: string,
  model: string,
  imageDataUrl?: string,
): Promise<{ items: ItemVerdict[]; language: string; languageName: string }> {
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: `${prompt}\n\nRespond with JSON only. No prose, no code fences.` },
  ];
  if (imageDataUrl) content.push({ type: 'image_url', image_url: { url: imageDataUrl } });

  const res = await fetch(NVIDIA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      max_tokens: 1024,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(NVIDIA_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`NVIDIA ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error('NVIDIA returned no content');

  const parsed = extractJson(text) as { language?: string; languageName?: string };
  return {
    items: enforceCitationIntegrity(normaliseItems(parsed)),
    language: parsed.language ?? 'en',
    languageName: parsed.languageName ?? 'English',
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Answer a request, descending the resilience stack until one tier succeeds.
 *
 * Gemini → NVIDIA → deterministic. The tier that answered is returned in the response
 * so the UI can show degradation rather than hide it.
 */
export async function answer(
  query: string,
  venueName: string,
  mode: Mode,
  profiles: AccessProfile[],
  imageDataUrl?: string,
): Promise<CheckResponse> {
  const venue = findVenue(venueName);
  const prompt = buildPrompt(query, venue.venue, mode);

  const attempts: Array<{ tier: Tier; run: () => Promise<{ items: ItemVerdict[]; language: string; languageName: string }> }> = [];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    attempts.push({ tier: 'gemini', run: () => callGemini(prompt, geminiKey, imageDataUrl) });
  }
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (nvidiaKey) {
    const model = process.env.NVIDIA_MODEL || 'meta/llama-3.2-90b-vision-instruct';
    attempts.push({ tier: 'nvidia', run: () => callNvidia(prompt, nvidiaKey, model, imageDataUrl) });
  }

  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      if (result.items.length === 0) throw new Error('Empty item list');

      const response: CheckResponse = {
        items: result.items,
        language: result.language,
        languageName: result.languageName,
        venue: venue.venue,
        mode,
        tier: attempt.tier,
      };
      if (mode === 'access') response.accessGuidance = buildAccessGuidance(venue.venue, profiles);
      if (mode === 'staff') response.staffScript = buildStaffScript(result.items, venue.venue);
      return response;
    } catch {
      // Fall through to the next tier. The deterministic engine is the guaranteed floor,
      // so a failure here is a degradation, never an error surfaced to the user.
      continue;
    }
  }

  return deterministicCheck(query, venue.venue, mode, profiles);
}
