/**
 * Seed policy data — the ground truth behind every verdict.
 *
 * This mirrors the `policies` and `venues` tabs of the Google Sheet. It ships in-repo
 * so the deterministic tier (and therefore the entire test suite) runs with no
 * credentials at all. When `GOOGLE_SHEETS_ID` is configured, live Sheet rows override
 * these at request time; this remains the offline floor.
 *
 * Rules are illustrative of real venue policy patterns and are labelled as demo data
 * in the UI. They are deliberately NOT presented as official FIFA guidance.
 */

import type { PolicyRule, Venue } from './types';

/** Sentinel venue meaning "applies at every venue". */
export const ALL_VENUES = 'ALL' as const;

/**
 * Tournament-wide and venue-specific item rules.
 *
 * Note the deliberate spread of `check_with_staff` outcomes (medical, animals,
 * ambiguous items). The three-state design is the product's safety story and needs
 * genuine examples, not a token one.
 */
export const POLICIES: readonly PolicyRule[] = [
  // ── Bags ────────────────────────────────────────────────────────────────
  {
    ruleId: 'ALL-1.1',
    venue: ALL_VENUES,
    item: 'clear bag',
    aliases: ['transparent bag', 'clear tote', 'see-through bag'],
    verdict: 'allowed',
    condition: 'Max 30cm x 15cm x 30cm',
    reason: 'Clear bags within the size limit are the standard permitted carry.',
    category: 'bags',
  },
  {
    ruleId: 'ALL-1.2',
    venue: ALL_VENUES,
    item: 'backpack',
    aliases: ['rucksack', 'knapsack', 'daypack', 'school bag'],
    verdict: 'not_allowed',
    reason: 'Non-transparent backpacks exceed the clear-bag policy.',
    fix: 'Use the bag check outside the gate, or transfer essentials to a clear bag.',
    category: 'bags',
  },
  {
    ruleId: 'ALL-1.3',
    venue: ALL_VENUES,
    item: 'small clutch',
    aliases: ['purse', 'clutch bag', 'wristlet'],
    verdict: 'allowed',
    condition: 'Max 12cm x 17cm, need not be transparent',
    reason: 'One small personal clutch is permitted alongside a clear bag.',
    category: 'bags',
  },
  {
    ruleId: 'ALL-1.4',
    venue: ALL_VENUES,
    item: 'diaper bag',
    aliases: ['nappy bag', 'baby bag', 'changing bag'],
    verdict: 'allowed',
    condition: 'When accompanied by an infant; subject to search',
    reason: 'Caregiver exemption applies when travelling with a child.',
    category: 'bags',
  },

  // ── Electronics ─────────────────────────────────────────────────────────
  {
    ruleId: 'ALL-2.1',
    venue: ALL_VENUES,
    item: 'power bank',
    aliases: ['battery pack', 'portable charger', 'powerbank', 'power pack'],
    verdict: 'allowed',
    condition: 'Under 100Wh',
    reason: 'Small lithium batteries are permitted under the venue fire-safety limit.',
    category: 'electronics',
  },
  {
    ruleId: 'ALL-2.2',
    venue: ALL_VENUES,
    item: 'professional camera',
    aliases: ['dslr', 'mirrorless camera', 'slr', 'professional lens'],
    verdict: 'not_allowed',
    condition: 'Detachable lens over 15cm',
    reason: 'Professional imaging equipment requires media accreditation.',
    fix: 'Phone and compact cameras are fine. Check larger gear at the bag check.',
    category: 'electronics',
  },
  {
    ruleId: 'ALL-2.3',
    venue: ALL_VENUES,
    item: 'tripod',
    aliases: ['monopod', 'camera stand', 'gimbal'],
    verdict: 'not_allowed',
    reason: 'Rigid poles obstruct sightlines and are a crowd-safety hazard.',
    fix: 'Check it at the bag check before entering.',
    category: 'electronics',
  },
  {
    ruleId: 'ALL-2.4',
    venue: ALL_VENUES,
    item: 'selfie stick',
    aliases: ['selfie pole', 'extension stick'],
    verdict: 'not_allowed',
    reason: 'Extendable poles obstruct sightlines in seated bowls.',
    fix: 'Leave it at your accommodation or check it at the bag check.',
    category: 'electronics',
  },
  {
    ruleId: 'ALL-2.5',
    venue: ALL_VENUES,
    item: 'laptop',
    aliases: ['notebook computer', 'macbook'],
    verdict: 'not_allowed',
    reason: 'Laptops exceed permitted electronics for general admission.',
    fix: 'Check it at the bag check; tablets under 25cm are permitted.',
    category: 'electronics',
  },
  {
    ruleId: 'ALL-2.11',
    venue: ALL_VENUES,
    item: 'smartphone',
    aliases: ['phone', 'mobile', 'mobile phone', 'cell phone', 'iphone', 'android'],
    verdict: 'allowed',
    reason: 'Phones are permitted and are the recommended way to carry your ticket.',
    category: 'electronics',
  },
  {
    ruleId: 'ALL-2.12',
    venue: ALL_VENUES,
    item: 'charging cable',
    aliases: ['cable', 'usb cable', 'charger cable', 'lead', 'cord'],
    verdict: 'allowed',
    reason: 'Charging cables are permitted alongside a compliant power bank.',
    category: 'electronics',
  },
  {
    ruleId: 'ALL-2.13',
    venue: ALL_VENUES,
    item: 'keys',
    aliases: ['house keys', 'car keys', 'keyring'],
    verdict: 'allowed',
    reason: 'Personal keys are permitted and subject to routine screening.',
    category: 'personal',
  },
  {
    ruleId: 'ALL-2.14',
    venue: ALL_VENUES,
    item: 'wallet',
    aliases: ['purse wallet', 'card holder', 'billfold'],
    verdict: 'allowed',
    reason: 'Wallets are permitted; most venues are contactless-only at concessions.',
    category: 'personal',
  },
  {
    ruleId: 'ALL-2.6',
    venue: ALL_VENUES,
    item: 'tablet',
    aliases: ['ipad', 'e-reader', 'kindle'],
    verdict: 'allowed',
    condition: 'Under 25cm diagonal',
    reason: 'Small tablets are permitted and subject to search.',
    category: 'electronics',
  },
  {
    ruleId: 'ALL-2.7',
    venue: ALL_VENUES,
    item: 'drone',
    aliases: ['quadcopter', 'uav'],
    verdict: 'not_allowed',
    reason: 'Unmanned aircraft are prohibited in and around the security perimeter.',
    fix: 'There is no check facility for drones. Do not bring one to the venue.',
    category: 'prohibited',
  },
  {
    ruleId: 'ALL-2.8',
    venue: ALL_VENUES,
    item: 'laser pointer',
    aliases: ['laser pen'],
    verdict: 'not_allowed',
    reason: 'Lasers endanger players and officials and carry ejection penalties.',
    category: 'prohibited',
  },
  {
    ruleId: 'ALL-2.9',
    venue: ALL_VENUES,
    item: 'noise cancelling headphones',
    aliases: ['headphones', 'ear defenders', 'earmuffs', 'noise cancelling'],
    verdict: 'allowed',
    reason: 'Hearing protection is permitted and encouraged for sensory comfort.',
    category: 'accessibility',
  },
  {
    ruleId: 'ALL-2.10',
    venue: ALL_VENUES,
    item: 'earplugs',
    aliases: ['ear plugs', 'foam plugs'],
    verdict: 'allowed',
    reason: 'Hearing protection is permitted.',
    category: 'accessibility',
  },

  // ── Drink and food ──────────────────────────────────────────────────────
  {
    ruleId: 'ALL-3.1',
    venue: ALL_VENUES,
    item: 'sealed water bottle',
    aliases: ['unopened water', 'sealed bottle'],
    verdict: 'not_allowed',
    reason: 'Sealed liquids cannot be verified at screening.',
    fix: 'Bring an empty reusable bottle and fill it at a free water point inside.',
    category: 'food_drink',
  },
  {
    ruleId: 'ALL-3.2',
    venue: ALL_VENUES,
    item: 'empty reusable bottle',
    aliases: ['empty bottle', 'reusable bottle', 'water bottle empty', 'flask'],
    verdict: 'allowed',
    condition: 'Empty, max 1L, non-glass',
    reason: 'Empty vessels are permitted and support the tournament waste-reduction goal.',
    category: 'sustainability',
  },
  {
    ruleId: 'ALL-3.3',
    venue: ALL_VENUES,
    item: 'baby formula',
    aliases: ['infant formula', 'baby milk', 'breast milk', 'baby food'],
    verdict: 'allowed',
    condition: 'When travelling with an infant',
    reason: 'Infant feeding supplies are exempt from the liquids restriction.',
    category: 'medical',
  },
  {
    ruleId: 'ALL-3.4',
    venue: ALL_VENUES,
    item: 'snacks',
    aliases: ['food', 'sandwich', 'chips', 'crisps'],
    verdict: 'check_with_staff',
    reason: 'Outside food rules vary by venue and by ticket type.',
    fix: 'Ask at the gate. Sealed single-serve snacks are usually fine.',
    category: 'food_drink',
  },
  {
    ruleId: 'ALL-3.5',
    venue: ALL_VENUES,
    item: 'alcohol',
    aliases: ['beer', 'wine', 'spirits', 'liquor'],
    verdict: 'not_allowed',
    reason: 'Outside alcohol is prohibited at all venues.',
    category: 'prohibited',
  },

  // ── Medical (highest-stakes category) ───────────────────────────────────
  {
    ruleId: 'ALL-4.1',
    venue: ALL_VENUES,
    item: 'insulin pen',
    aliases: ['insulin', 'diabetes kit', 'glucose monitor', 'insulin pump'],
    verdict: 'check_with_staff',
    reason:
      'Medical exemptions exist but must be processed in person so your equipment is not delayed at general screening.',
    fix: 'Use the medical lane. Bring the prescription label if you have it.',
    category: 'medical',
  },
  {
    ruleId: 'ALL-4.2',
    venue: ALL_VENUES,
    item: 'epipen',
    aliases: ['epi pen', 'adrenaline auto-injector', 'anaphylaxis pen'],
    verdict: 'check_with_staff',
    reason: 'Auto-injectors are permitted but should be declared so staff can assist in an emergency.',
    fix: 'Declare it at the medical lane on arrival.',
    category: 'medical',
  },
  {
    ruleId: 'ALL-4.3',
    venue: ALL_VENUES,
    item: 'prescription medication',
    aliases: ['medication', 'prescription', 'pills', 'medicine', 'tablets medicine'],
    verdict: 'check_with_staff',
    reason: 'Quantities and packaging requirements vary; staff verification avoids a refusal at the gate.',
    fix: 'Keep medication in labelled original packaging and use the medical lane.',
    category: 'medical',
  },
  {
    ruleId: 'ALL-4.4',
    venue: ALL_VENUES,
    item: 'crutches',
    aliases: ['walking stick', 'cane', 'walker', 'walking frame'],
    verdict: 'allowed',
    reason: 'Mobility aids are always permitted.',
    category: 'accessibility',
  },
  {
    ruleId: 'ALL-4.5',
    venue: ALL_VENUES,
    item: 'wheelchair',
    aliases: ['manual wheelchair', 'powered wheelchair', 'mobility scooter'],
    verdict: 'allowed',
    reason: 'Wheelchairs are always permitted; use the accessible gate for step-free entry.',
    category: 'accessibility',
  },
  {
    ruleId: 'ALL-4.6',
    venue: ALL_VENUES,
    item: 'service animal',
    aliases: ['guide dog', 'assistance dog', 'service dog'],
    verdict: 'allowed',
    reason: 'Trained service animals are permitted at all venues.',
    category: 'accessibility',
  },
  {
    ruleId: 'ALL-4.7',
    venue: ALL_VENUES,
    item: 'emotional support animal',
    aliases: ['support animal', 'comfort animal', 'therapy animal', 'pet'],
    verdict: 'check_with_staff',
    reason:
      'Emotional support animals are treated differently from service animals and the rules vary by host country.',
    fix: 'Contact venue accessibility services before match day.',
    category: 'accessibility',
  },

  // ── Fan gear ────────────────────────────────────────────────────────────
  {
    ruleId: 'ALL-5.1',
    venue: ALL_VENUES,
    item: 'flag with pole',
    aliases: ['flagpole', 'flag pole', 'banner pole'],
    verdict: 'not_allowed',
    reason: 'Rigid poles are a crowd-safety hazard.',
    fix: 'Bring the flag without the pole — flags themselves are welcome.',
    category: 'fan_gear',
  },
  {
    ruleId: 'ALL-5.2',
    venue: ALL_VENUES,
    item: 'flag without pole',
    aliases: ['flag', 'national flag', 'fabric flag'],
    verdict: 'allowed',
    condition: 'Max 2m x 1.5m, must not obstruct other spectators',
    reason: 'Flags are permitted and encouraged.',
    category: 'fan_gear',
  },
  {
    ruleId: 'ALL-5.3',
    venue: ALL_VENUES,
    item: 'air horn',
    aliases: ['airhorn', 'klaxon', 'vuvuzela', 'horn'],
    verdict: 'not_allowed',
    reason: 'Amplified noise devices interfere with safety announcements.',
    category: 'prohibited',
  },
  {
    ruleId: 'ALL-5.4',
    venue: ALL_VENUES,
    item: 'drum',
    aliases: ['percussion', 'bongo'],
    verdict: 'check_with_staff',
    reason: 'Instruments are permitted only in designated supporter sections.',
    fix: 'Confirm with your supporters group and the venue before match day.',
    category: 'fan_gear',
  },
  {
    ruleId: 'ALL-5.5',
    venue: ALL_VENUES,
    item: 'banner',
    aliases: ['tifo', 'sign', 'placard'],
    verdict: 'check_with_staff',
    condition: 'Large banners require prior approval',
    reason: 'Banner size and content require stewarding approval.',
    fix: 'Submit large banners to venue operations in advance.',
    category: 'fan_gear',
  },
  {
    ruleId: 'ALL-5.6',
    venue: ALL_VENUES,
    item: 'umbrella',
    aliases: ['brolly', 'parasol'],
    verdict: 'not_allowed',
    reason: 'Umbrellas obstruct sightlines and their spokes are a hazard in dense crowds.',
    fix: 'Bring a poncho or rain jacket instead.',
    category: 'fan_gear',
  },
  {
    ruleId: 'ALL-5.7',
    venue: ALL_VENUES,
    item: 'folding chair',
    aliases: ['camping chair', 'stool', 'portable chair'],
    verdict: 'not_allowed',
    reason: 'Furniture obstructs egress routes.',
    category: 'prohibited',
  },
  {
    ruleId: 'ALL-5.8',
    venue: ALL_VENUES,
    item: 'seat cushion',
    aliases: ['cushion', 'seat pad'],
    verdict: 'allowed',
    condition: 'Soft, no pockets, no metal frame',
    reason: 'Soft cushions without storage are permitted.',
    category: 'fan_gear',
  },

  // ── Misc ────────────────────────────────────────────────────────────────
  {
    ruleId: 'ALL-6.1',
    venue: ALL_VENUES,
    item: 'aerosol sunscreen',
    aliases: ['spray sunscreen', 'aerosol', 'spray can'],
    verdict: 'not_allowed',
    reason: 'Pressurised aerosols are prohibited.',
    fix: 'Bring lotion sunscreen instead — under 100ml is permitted.',
    category: 'prohibited',
  },
  {
    ruleId: 'ALL-6.2',
    venue: ALL_VENUES,
    item: 'lotion sunscreen',
    aliases: ['sunscreen', 'sun cream', 'sunblock'],
    verdict: 'allowed',
    condition: 'Non-aerosol, under 100ml',
    reason: 'Non-pressurised sun protection is permitted.',
    category: 'health',
  },
  {
    ruleId: 'ALL-6.3',
    venue: ALL_VENUES,
    item: 'vape',
    aliases: ['e-cigarette', 'vape pen', 'juul', 'electronic cigarette'],
    verdict: 'not_allowed',
    reason: 'Vaping devices are prohibited inside the bowl at all venues.',
    category: 'prohibited',
  },
  {
    ruleId: 'ALL-6.4',
    venue: ALL_VENUES,
    item: 'lighter',
    aliases: ['matches', 'flame', 'zippo'],
    verdict: 'not_allowed',
    reason: 'Ignition sources and pyrotechnics are strictly prohibited.',
    category: 'prohibited',
  },
  {
    ruleId: 'ALL-6.5',
    venue: ALL_VENUES,
    item: 'cash',
    aliases: ['money', 'banknotes', 'coins'],
    verdict: 'check_with_staff',
    reason: 'Many venues are cashless; cash may not be accepted at concessions.',
    fix: 'Bring a contactless card or phone wallet as your primary payment.',
    category: 'payments',
  },
  // ── Venue-specific ──────────────────────────────────────────────────────
  // Real venues layer local rules on top of tournament-wide policy. These exist so the
  // venue selector changes the answer, not just the header.
  {
    ruleId: 'MET-7.1',
    venue: 'MetLife Stadium',
    item: 'transit card',
    aliases: ['metrocard', 'rail ticket', 'njt ticket'],
    verdict: 'allowed',
    reason: 'Rail is the recommended approach; keep your return ticket accessible.',
    category: 'transport',
  },
  {
    ruleId: 'AZT-7.1',
    venue: 'Estadio Azteca',
    item: 'altitude medication',
    aliases: ['soroche', 'altitude sickness tablets'],
    verdict: 'check_with_staff',
    reason: 'Mexico City sits at 2,240m. Medication is permitted but should be declared.',
    fix: 'Declare it at the medical lane on arrival.',
    category: 'medical',
  },
  {
    ruleId: 'ALL-6.6',
    venue: ALL_VENUES,
    item: 'stroller',
    aliases: ['pushchair', 'pram', 'buggy'],
    verdict: 'check_with_staff',
    reason: 'Stroller policy depends on your seating area and the venue.',
    fix: 'Most venues offer stroller parking near the accessible gate — confirm on arrival.',
    category: 'accessibility',
  },
];

/**
 * Venue facts driving accessibility routing.
 *
 * A representative subset of 2026 host venues — enough to make the selector real
 * without turning the build into data entry.
 */
export const VENUES: readonly Venue[] = [
  {
    venue: 'MetLife Stadium',
    city: 'New York / New Jersey',
    accessibleGate: 'Gate C',
    medicalLaneGate: 'Gate A',
    bagCheckLocation: 'Lot B kiosk',
    bagCheckCost: '$15',
    quietRoom: 'Level 2, Section 214',
    elevatorRoute: 'Gate C → Elevator bank 3 → Level 2',
    companionSeating: 'Rows 1–4 of all accessible sections',
    mapsDestination: 'MetLife Stadium, East Rutherford, NJ',
  },
  {
    venue: 'SoFi Stadium',
    city: 'Los Angeles',
    accessibleGate: 'Entry 3 (step-free)',
    medicalLaneGate: 'Entry 1',
    bagCheckLocation: 'American Airlines Plaza',
    bagCheckCost: '$20',
    quietRoom: 'Level 1, near Section 128',
    elevatorRoute: 'Entry 3 → Elevator E4 → Level 1 concourse',
    companionSeating: 'Designated companion seats adjacent to all wheelchair positions',
    mapsDestination: 'SoFi Stadium, Inglewood, CA',
  },
  {
    venue: 'Estadio Azteca',
    city: 'Mexico City',
    accessibleGate: 'Puerta 2',
    medicalLaneGate: 'Puerta 1',
    bagCheckLocation: 'Estacionamiento Norte',
    bagCheckCost: 'MX$150',
    quietRoom: 'Nivel 1, Sección 104',
    elevatorRoute: 'Puerta 2 → Ascensor A → Nivel 1',
    companionSeating: 'Asientos acompañante junto a cada plaza de silla de ruedas',
    mapsDestination: 'Estadio Azteca, Ciudad de México',
  },
  {
    venue: 'BMO Field',
    city: 'Toronto',
    accessibleGate: 'Gate 5',
    medicalLaneGate: 'Gate 1',
    bagCheckLocation: 'Princes’ Gate entrance',
    bagCheckCost: 'C$10',
    quietRoom: 'West stand, Room W12',
    elevatorRoute: 'Gate 5 → West elevator → Upper concourse',
    companionSeating: 'Rows A–B, accessible platforms',
    mapsDestination: 'BMO Field, Toronto, ON',
  },
  {
    venue: 'Arrowhead Stadium',
    city: 'Kansas City',
    accessibleGate: 'Gate D',
    medicalLaneGate: 'Gate A',
    bagCheckLocation: 'Lot J',
    bagCheckCost: '$15',
    quietRoom: 'Level 2, Section 226',
    elevatorRoute: 'Gate D → Elevator 2 → Level 2',
    companionSeating: 'Companion seat beside each accessible position',
    mapsDestination: 'Arrowhead Stadium, Kansas City, MO',
  },
];

/**
 * Non-English aliases for the highest-traffic items.
 *
 * The LLM tiers handle any language natively. This map exists so the *deterministic*
 * tier stays multilingual too — otherwise the offline safety net silently fails for
 * exactly the fans who need it most: a Spanish or Portuguese speaker at a gate when
 * the network is down would get "check with staff" for every item.
 *
 * Keyed by `ruleId` rather than inlined into the rules so the English data stays
 * readable and translations can grow without bloating every row.
 */
export const I18N_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'ALL-1.2': ['mochila', 'sac à dos', 'rucksack'],
  'ALL-1.1': ['bolsa transparente', 'sac transparent'],
  'ALL-2.1': ['batería externa', 'bateria externa', 'batterie externe', 'cargador portátil'],
  'ALL-2.2': ['cámara profesional', 'câmera profissional', 'appareil photo'],
  'ALL-2.3': ['trípode', 'tripé', 'trépied'],
  'ALL-3.1': ['botella de agua', 'garrafa de água', 'bouteille d’eau', 'agua sellada'],
  'ALL-3.2': ['botella vacía', 'garrafa vazia', 'bouteille vide'],
  'ALL-4.1': ['insulina', 'pluma de insulina', 'caneta de insulina', 'stylo à insuline'],
  'ALL-4.3': ['medicamento', 'medicamentos', 'medicação', 'médicaments', 'receta'],
  'ALL-4.4': ['muletas', 'béquilles', 'bastón'],
  'ALL-4.5': ['silla de ruedas', 'cadeira de rodas', 'fauteuil roulant'],
  'ALL-4.6': ['perro guía', 'cão-guia', 'chien guide', 'perro de servicio'],
  'ALL-5.1': ['bandera con asta', 'bandeira com mastro', 'drapeau avec mât', 'mastro', 'asta'],
  'ALL-5.2': ['bandera', 'bandeira', 'drapeau', 'fahne'],
  'ALL-5.6': ['paraguas', 'guarda-chuva', 'parapluie', 'sombrilla'],
  'ALL-6.3': ['cigarrillo electrónico', 'cigarro eletrônico', 'cigarette électronique'],
  'ALL-6.4': ['encendedor', 'isqueiro', 'briquet', 'mechero'],
  'ALL-6.6': ['carrito de bebé', 'carrinho de bebê', 'poussette', 'cochecito'],
};

/** All match terms for a rule: canonical name, English aliases, and translations. */
export function allAliases(rule: PolicyRule): string[] {
  return [rule.item, ...rule.aliases, ...(I18N_ALIASES[rule.ruleId] ?? [])];
}

/** Default venue used when the client does not specify one. */
export const DEFAULT_VENUE = VENUES[0].venue;

/** Look up a venue by name, falling back to the default. */
export function findVenue(name?: string): Venue {
  if (!name) return VENUES[0];
  const match = VENUES.find((v) => v.venue.toLowerCase() === name.toLowerCase());
  return match ?? VENUES[0];
}

/** Policy rules applicable at a given venue (venue-specific plus tournament-wide). */
export function policiesForVenue(venue: string): PolicyRule[] {
  return POLICIES.filter((p) => p.venue === ALL_VENUES || p.venue === venue);
}
