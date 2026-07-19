/**
 * Core domain types for GateReady.
 *
 * The three-state verdict is the safety spine of the product: when no policy rule
 * matches, the system must return `check_with_staff` rather than guess. A wrong
 * "allowed" on a medical item is real-world harm, not a scoring loss.
 */

/** Outcome of evaluating a single item against venue policy. */
export type Verdict = 'allowed' | 'not_allowed' | 'check_with_staff';

/** Which audience view produced a request. */
export type Mode = 'fan' | 'access' | 'staff';

/** Which resilience tier answered. Surfaced in the UI so degradation is never silent. */
export type Tier = 'gemini' | 'nvidia' | 'deterministic';

/** Accessibility profiles that change gate routing and facility guidance. */
export type AccessProfile =
  | 'wheelchair'
  | 'ambulatory'
  | 'sensory'
  | 'medical_device'
  | 'service_animal'
  | 'companion';

/** A single row of the `policies` sheet — the ground truth for item rules. */
export interface PolicyRule {
  /** Stable identifier cited in every verdict, e.g. `MET-4.2`. */
  ruleId: string;
  /** Venue name, or `ALL` for tournament-wide rules. */
  venue: string;
  /** Lowercase canonical item name. */
  item: string;
  /** Alternate spellings and colloquialisms; drives deterministic matching. */
  aliases: string[];
  verdict: Verdict;
  /** Qualifier on the verdict, e.g. "Under 100Wh". */
  condition?: string;
  /** Plain-language justification shown to the fan. */
  reason: string;
  /** Actionable next step when the verdict is not `allowed`. */
  fix?: string;
  /** Grouping key for operational aggregation. */
  category: string;
}

/** A single row of the `venues` sheet — gate and accessibility facts. */
export interface Venue {
  venue: string;
  city: string;
  accessibleGate: string;
  medicalLaneGate: string;
  bagCheckLocation: string;
  bagCheckCost: string;
  quietRoom: string;
  elevatorRoute: string;
  companionSeating: string;
  /** Free-text destination for Google Maps URL-spec links. */
  mapsDestination: string;
}

/** One evaluated item in a response. */
export interface ItemVerdict {
  /** Item as the user referred to it. */
  label: string;
  verdict: Verdict;
  reason: string;
  condition?: string;
  fix?: string;
  /** `ruleId` of the source row, or `null` when no rule matched. */
  sourceRuleId: string | null;
}

/** Full response returned to the client. */
export interface CheckResponse {
  items: ItemVerdict[];
  /** BCP-47-ish code detected from the user's input, e.g. `pt`. */
  language: string;
  /** Human-readable language name for the "Detected" chip. */
  languageName: string;
  venue: string;
  mode: Mode;
  /** Which tier answered — drives the visible degradation badge. */
  tier: Tier;
  /** Populated in `staff` mode: a script the volunteer reads aloud. */
  staffScript?: string;
  /** Populated in `access` mode: routing and facility guidance. */
  accessGuidance?: AccessGuidance;
}

/** Accessibility routing produced for `access` mode. */
export interface AccessGuidance {
  gate: string;
  elevatorRoute: string;
  companionSeating: string;
  quietRoom: string;
  /** Google Maps URL-spec link — no API key, no billing. */
  mapsUrl: string;
  notes: string[];
}

/** Request body accepted by `POST /api/check`. */
export interface CheckRequest {
  /** Free-text question in any language. */
  query?: string;
  /** Base64 data URL of a bag photo. Never persisted. */
  imageDataUrl?: string;
  venue?: string;
  mode?: Mode;
  profiles?: AccessProfile[];
}
