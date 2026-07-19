/**
 * Policy data and lookups.
 *
 * Beyond the lookup helpers, these tests assert invariants over the seed data itself.
 * A duplicate rule id or a verdict typo would silently corrupt every citation, and that
 * is not the kind of thing to discover on stage.
 */

import { describe, expect, it } from 'vitest';

import {
  allAliases,
  DEFAULT_VENUE,
  findVenue,
  I18N_ALIASES,
  policiesForVenue,
  POLICIES,
  VENUES,
} from '@/lib/policies';
import type { Verdict } from '@/lib/types';

const VALID_VERDICTS: readonly Verdict[] = ['allowed', 'not_allowed', 'check_with_staff'];

describe('findVenue', () => {
  it('returns the default when given no name', () => {
    expect(findVenue().venue).toBe(DEFAULT_VENUE);
  });

  it('returns the default when given an empty name', () => {
    expect(findVenue('').venue).toBe(DEFAULT_VENUE);
  });

  it('matches case-insensitively', () => {
    expect(findVenue('sofi stadium').venue).toBe('SoFi Stadium');
  });

  it('falls back to the default for an unknown venue', () => {
    expect(findVenue('Nowhere').venue).toBe(DEFAULT_VENUE);
  });
});

describe('policiesForVenue', () => {
  it('includes tournament-wide rules', () => {
    expect(policiesForVenue('SoFi Stadium').some((p) => p.ruleId === 'ALL-1.2')).toBe(true);
  });

  it('includes venue-specific rules for that venue', () => {
    expect(policiesForVenue('MetLife Stadium').some((p) => p.ruleId === 'MET-7.1')).toBe(true);
  });

  it("excludes another venue's specific rules", () => {
    expect(policiesForVenue('SoFi Stadium').some((p) => p.ruleId === 'MET-7.1')).toBe(false);
    expect(policiesForVenue('SoFi Stadium').some((p) => p.ruleId === 'AZT-7.1')).toBe(false);
  });
});

describe('allAliases', () => {
  it('includes the canonical name and English aliases', () => {
    const rule = POLICIES.find((p) => p.ruleId === 'ALL-1.2')!;
    const aliases = allAliases(rule);
    expect(aliases).toContain('backpack');
    expect(aliases).toContain('rucksack');
  });

  it('includes translations when the rule has them', () => {
    const rule = POLICIES.find((p) => p.ruleId === 'ALL-1.2')!;
    expect(allAliases(rule)).toContain('mochila');
  });

  it('returns only the canonical set when a rule has no translations', () => {
    const rule = POLICIES.find((p) => p.ruleId === 'MET-7.1')!;
    expect(allAliases(rule)).toEqual(['transit card', 'metrocard', 'rail ticket', 'njt ticket']);
  });
});

describe('seed data invariants', () => {
  it('has no duplicate rule ids', () => {
    const ids = POLICIES.map((p) => p.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only valid verdicts', () => {
    for (const rule of POLICIES) {
      expect(VALID_VERDICTS).toContain(rule.verdict);
    }
  });

  it('gives every rule a non-empty reason', () => {
    for (const rule of POLICIES) {
      expect(rule.reason.length).toBeGreaterThan(0);
    }
  });

  it('gives every prohibited item an actionable fix or an explicit reason', () => {
    for (const rule of POLICIES.filter((p) => p.verdict === 'not_allowed')) {
      expect(rule.fix ?? rule.reason).toBeTruthy();
    }
  });

  it('keys every translation onto a real rule', () => {
    const ids = new Set(POLICIES.map((p) => p.ruleId));
    for (const ruleId of Object.keys(I18N_ALIASES)) {
      expect(ids.has(ruleId)).toBe(true);
    }
  });

  it('has at least one rule in each verdict state so the demo can show all three', () => {
    for (const verdict of VALID_VERDICTS) {
      expect(POLICIES.some((p) => p.verdict === verdict)).toBe(true);
    }
  });

  it('gives every venue the fields the access view renders', () => {
    for (const venue of VENUES) {
      expect(venue.accessibleGate).toBeTruthy();
      expect(venue.medicalLaneGate).toBeTruthy();
      expect(venue.quietRoom).toBeTruthy();
      expect(venue.elevatorRoute).toBeTruthy();
      expect(venue.mapsDestination).toBeTruthy();
    }
  });
});

describe('alias length invariant', () => {
  it('has no alias shorter than three characters', () => {
    // The matcher guards against short aliases because they match inside unrelated
    // words. This asserts the seed data never relies on that guard firing.
    for (const rule of POLICIES) {
      for (const alias of allAliases(rule)) {
        expect(alias.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
