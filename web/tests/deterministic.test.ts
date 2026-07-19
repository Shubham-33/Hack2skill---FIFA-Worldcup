/**
 * Tier 3 — the deterministic engine.
 *
 * These tests run with no API key by design. If they ever start needing one, the
 * offline guarantee has been broken.
 */

import { describe, expect, it } from 'vitest';

import {
  buildAccessGuidance,
  buildCalendarUrl,
  buildMapsUrl,
  buildStaffScript,
  detectLanguage,
  deterministicCheck,
  matchRules,
  ruleToVerdict,
  unknownVerdict,
} from '@/lib/deterministic';
import { POLICIES } from '@/lib/policies';

const VENUE = 'MetLife Stadium';

describe('detectLanguage', () => {
  it('defaults to English for empty input', () => {
    expect(detectLanguage('')).toEqual({ language: 'en', languageName: 'English' });
    expect(detectLanguage('   ')).toEqual({ language: 'en', languageName: 'English' });
  });

  it('detects English when no marker words match', () => {
    expect(detectLanguage('hello there').language).toBe('en');
  });

  it.each([
    ['ar', 'هل يمكنني إحضار حقيبة؟'],
    ['ja', '傘は持ち込めますか'],
    ['ko', '우산을 가져올 수 있나요'],
    ['zh', '我可以带雨伞吗'],
    ['hi', 'क्या मैं बैग ला सकता हूँ'],
    ['ru', 'можно ли принести зонт'],
  ])('detects %s by script', (code, text) => {
    expect(detectLanguage(text).language).toBe(code);
  });

  it.each([
    ['es', 'puedo llevar una mochila'],
    ['pt', 'posso levar uma bandeira'],
    ['fr', 'puis-je apporter un drapeau'],
    ['de', 'kann ich eine fahne mitbringen'],
    ['it', 'posso portare una bandiera'],
    ['nl', 'mag ik een vlag meenemen'],
  ])('detects %s by marker words', (code, text) => {
    expect(detectLanguage(text).language).toBe(code);
  });

  it('gives every marker language a display name', () => {
    // The `?? LANGUAGE_NAMES.en` fallback in detectLanguage guards future data entry.
    // This asserts no current marker language relies on it firing.
    const markerSamples: Record<string, string> = {
      es: 'puedo llevar',
      pt: 'posso levar',
      fr: 'puis-je apporter',
      de: 'kann ich mitbringen',
      it: 'posso portare',
      nl: 'mag ik meenemen',
    };
    for (const [code, sample] of Object.entries(markerSamples)) {
      const detected = detectLanguage(sample);
      expect(detected.language).toBe(code);
      expect(detected.languageName).not.toBe('English');
      expect(detected.languageName.length).toBeGreaterThan(0);
    }
  });
});

describe('matchRules', () => {
  it('returns nothing for blank input', () => {
    expect(matchRules('', VENUE)).toEqual([]);
    expect(matchRules('   ', VENUE)).toEqual([]);
  });

  it('matches a canonical item name', () => {
    const rules = matchRules('can I bring a tripod', VENUE);
    expect(rules.map((r) => r.ruleId)).toContain('ALL-2.3');
  });

  it('matches an English alias', () => {
    const rules = matchRules('is a portable charger ok', VENUE);
    expect(rules.map((r) => r.ruleId)).toContain('ALL-2.1');
  });

  it('matches a non-English alias so the offline tier stays multilingual', () => {
    const rules = matchRules('posso levar uma bandeira com mastro', VENUE);
    expect(rules.map((r) => r.ruleId)).toContain('ALL-5.1');
  });

  it('prefers the longer match when two rules share a prefix', () => {
    const rules = matchRules('flag with pole', VENUE);
    expect(rules[0].ruleId).toBe('ALL-5.1');
  });

  it('matches multiple distinct items in one query', () => {
    const ids = matchRules('a backpack and an umbrella', VENUE).map((r) => r.ruleId);
    expect(ids).toContain('ALL-1.2');
    expect(ids).toContain('ALL-5.6');
  });

  it('ignores aliases shorter than the minimum length', () => {
    // No rule should match on a two-character fragment.
    expect(matchRules('ab', VENUE)).toEqual([]);
  });
});

describe('ruleToVerdict and unknownVerdict', () => {
  it('maps a rule onto a verdict', () => {
    const rule = POLICIES.find((p) => p.ruleId === 'ALL-1.2')!;
    const verdict = ruleToVerdict(rule);
    expect(verdict).toMatchObject({
      label: 'backpack',
      verdict: 'not_allowed',
      sourceRuleId: 'ALL-1.2',
    });
  });

  it('returns check_with_staff and no citation for an unknown item', () => {
    const verdict = unknownVerdict('jetpack');
    expect(verdict.verdict).toBe('check_with_staff');
    expect(verdict.sourceRuleId).toBeNull();
  });
});

describe('URL-spec builders', () => {
  it('builds an encoded Maps directions link', () => {
    const url = buildMapsUrl('MetLife Stadium, East Rutherford, NJ');
    expect(url).toContain('https://www.google.com/maps/dir/?api=1&destination=');
    expect(url).toContain('MetLife%20Stadium');
  });

  it('builds an encoded Calendar template link', () => {
    const url = buildCalendarUrl(
      'Leave for the match',
      '20260719T160000Z',
      '20260719T190000Z',
      'Bring: power bank',
      'MetLife Stadium',
    );
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('dates=20260719T160000Z%2F20260719T190000Z');
    expect(url).toContain('text=Leave+for+the+match');
  });
});

describe('buildAccessGuidance', () => {
  it('routes to the accessible gate by default', () => {
    const guidance = buildAccessGuidance(VENUE, ['wheelchair']);
    expect(guidance.gate).toBe('Gate C');
    expect(guidance.notes).toHaveLength(1);
  });

  it('routes to the medical lane when a medical device is declared', () => {
    const guidance = buildAccessGuidance(VENUE, ['medical_device']);
    expect(guidance.gate).toBe('Gate A');
  });

  it('returns no notes when no profile is selected', () => {
    expect(buildAccessGuidance(VENUE, []).notes).toEqual([]);
  });
});

describe('buildStaffScript', () => {
  it('produces one line per verdict state', () => {
    const script = buildStaffScript(
      [
        { label: 'power bank', verdict: 'allowed', reason: 'r', sourceRuleId: 'ALL-2.1' },
        { label: 'backpack', verdict: 'not_allowed', reason: 'r', fix: 'Use bag check.', sourceRuleId: 'ALL-1.2' },
        { label: 'insulin', verdict: 'check_with_staff', reason: 'r', sourceRuleId: 'ALL-4.1' },
      ],
      VENUE,
    );
    expect(script).toContain('✅ power bank');
    expect(script).toContain('❌ backpack: cannot come in. Use bag check.');
    expect(script).toContain('⚠️ insulin: send to Gate A');
  });

  it('falls back to the venue bag check when a rule has no fix', () => {
    const script = buildStaffScript(
      [{ label: 'thing', verdict: 'not_allowed', reason: 'r', sourceRuleId: null }],
      VENUE,
    );
    expect(script).toContain('Lot B kiosk');
  });
});

describe('deterministicCheck', () => {
  it('answers a matched query with cited rules', () => {
    const result = deterministicCheck('can I bring a tripod', VENUE, 'fan', []);
    expect(result.tier).toBe('deterministic');
    expect(result.items[0].sourceRuleId).toBe('ALL-2.3');
  });

  it('returns check_with_staff when nothing matches', () => {
    const result = deterministicCheck('can I bring a jetpack', VENUE, 'fan', []);
    expect(result.items[0].verdict).toBe('check_with_staff');
    expect(result.items[0].sourceRuleId).toBeNull();
  });

  it('labels an empty query with a placeholder', () => {
    const result = deterministicCheck('   ', VENUE, 'fan', []);
    expect(result.items[0].label).toBe('your item');
  });

  it('adds access guidance in access mode', () => {
    const result = deterministicCheck('wheelchair', VENUE, 'access', ['wheelchair']);
    expect(result.accessGuidance?.gate).toBe('Gate C');
  });

  it('adds a staff script in staff mode', () => {
    const result = deterministicCheck('backpack', VENUE, 'staff', []);
    expect(result.staffScript).toContain('❌');
  });

  it('uses default arguments when mode and profiles are omitted', () => {
    const result = deterministicCheck('backpack', VENUE);
    expect(result.mode).toBe('fan');
    expect(result.accessGuidance).toBeUndefined();
    expect(result.staffScript).toBeUndefined();
  });
});

describe('null-safety guards', () => {
  it('detectLanguage tolerates a null input', () => {
    expect(detectLanguage(null as unknown as string).language).toBe('en');
  });

  it('matchRules tolerates a null input', () => {
    expect(matchRules(null as unknown as string, VENUE)).toEqual([]);
  });
});
