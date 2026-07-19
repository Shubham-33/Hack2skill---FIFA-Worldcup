/**
 * Operational aggregation.
 *
 * The behaviour worth protecting here is canonical keying: the same item asked about in
 * four languages must aggregate into one row, or the operational signal fragments into
 * noise and no suggestion ever fires.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { getOpsSnapshot, getSuggestions, recordQuestions, resetOpsLog } from '@/lib/oplog';
import type { CheckResponse, ItemVerdict } from '@/lib/types';

function response(items: ItemVerdict[], languageName = 'English'): CheckResponse {
  return {
    items,
    language: 'en',
    languageName,
    venue: 'MetLife Stadium',
    mode: 'fan',
    tier: 'deterministic',
  };
}

const BACKPACK: ItemVerdict = {
  label: 'backpack',
  verdict: 'not_allowed',
  reason: 'r',
  sourceRuleId: 'ALL-1.2',
};

beforeEach(() => {
  resetOpsLog();
});

describe('recordQuestions', () => {
  it('starts empty', () => {
    expect(getOpsSnapshot()).toMatchObject({ rows: [], languages: [], totalQuestions: 0 });
  });

  it('records a single question', async () => {
    await recordQuestions(response([BACKPACK]));
    const snapshot = getOpsSnapshot();
    expect(snapshot.totalQuestions).toBe(1);
    expect(snapshot.rows[0]).toMatchObject({ item: 'backpack', verdict: 'not_allowed', count: 1 });
  });

  it('collapses localised labels onto the canonical item name', async () => {
    // The same rule cited under four different display labels.
    for (const label of ['backpack', 'mochila', 'sac à dos', 'Rucksack']) {
      await recordQuestions(response([{ ...BACKPACK, label }]));
    }
    const snapshot = getOpsSnapshot();
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({ item: 'backpack', count: 4 });
  });

  it('keeps unmatched items under their own lowercased label', async () => {
    await recordQuestions(
      response([{ label: 'Jetpack', verdict: 'check_with_staff', reason: 'r', sourceRuleId: null }]),
    );
    expect(getOpsSnapshot().rows[0]).toMatchObject({ item: 'jetpack', category: 'unmatched' });
  });

  it('falls back to the label when the cited rule is unknown', async () => {
    await recordQuestions(
      response([{ label: 'Ghost', verdict: 'allowed', reason: 'r', sourceRuleId: 'FAKE-1.1' }]),
    );
    expect(getOpsSnapshot().rows[0]).toMatchObject({ item: 'ghost', category: 'unmatched' });
  });

  it('normalises language casing so one language is not counted twice', async () => {
    await recordQuestions(response([BACKPACK], 'español'));
    await recordQuestions(response([BACKPACK], 'Español'));
    const { languages } = getOpsSnapshot();
    expect(languages).toHaveLength(1);
    expect(languages[0]).toMatchObject({ language: 'Español', count: 2 });
  });

  it('sorts rows by frequency', async () => {
    await recordQuestions(response([BACKPACK]));
    await recordQuestions(response([BACKPACK]));
    await recordQuestions(
      response([{ label: 'tripod', verdict: 'not_allowed', reason: 'r', sourceRuleId: 'ALL-2.3' }]),
    );
    expect(getOpsSnapshot().rows[0].item).toBe('backpack');
  });
});

describe('getSuggestions', () => {
  it('returns nothing below the threshold', async () => {
    await recordQuestions(response([BACKPACK]));
    expect(getSuggestions()).toEqual([]);
  });

  it('suggests signage once a prohibited item crosses the threshold', async () => {
    for (let i = 0; i < 3; i += 1) await recordQuestions(response([BACKPACK]));
    const suggestions = getSuggestions();
    expect(suggestions[0]).toContain('backpack');
    expect(suggestions[0]).toContain('Post signage');
  });

  it('suggests briefing the medical lane for check_with_staff items', async () => {
    const insulin: ItemVerdict = {
      label: 'insulin pen',
      verdict: 'check_with_staff',
      reason: 'r',
      sourceRuleId: 'ALL-4.1',
    };
    for (let i = 0; i < 3; i += 1) await recordQuestions(response([insulin]));
    expect(getSuggestions()[0]).toContain('medical lane');
  });

  it('ignores allowed items — they need no operator action', async () => {
    const ok: ItemVerdict = {
      label: 'power bank',
      verdict: 'allowed',
      reason: 'r',
      sourceRuleId: 'ALL-2.1',
    };
    for (let i = 0; i < 5; i += 1) await recordQuestions(response([ok]));
    expect(getSuggestions()).toEqual([]);
  });

  it('honours a custom threshold', async () => {
    await recordQuestions(response([BACKPACK]));
    expect(getSuggestions(1)).toHaveLength(1);
  });

  it('caps the number of suggestions returned', async () => {
    const prohibited = [
      'ALL-1.2',
      'ALL-2.3',
      'ALL-2.4',
      'ALL-2.5',
      'ALL-5.3',
      'ALL-5.6',
      'ALL-5.7',
      'ALL-6.3',
    ];
    for (const ruleId of prohibited) {
      for (let i = 0; i < 3; i += 1) {
        await recordQuestions(
          response([{ label: ruleId, verdict: 'not_allowed', reason: 'r', sourceRuleId: ruleId }]),
        );
      }
    }
    expect(getSuggestions().length).toBeLessThanOrEqual(6);
  });
});

describe('language ordering', () => {
  it('sorts languages by frequency', async () => {
    await recordQuestions(response([BACKPACK], 'English'));
    await recordQuestions(response([BACKPACK], 'English'));
    await recordQuestions(response([BACKPACK], 'Português'));
    const { languages } = getOpsSnapshot();
    expect(languages[0]).toMatchObject({ language: 'English', count: 2 });
    expect(languages[1]).toMatchObject({ language: 'Português', count: 1 });
  });
});

describe('memory bounds', () => {
  it('stops adding new tally keys once the cap is reached', async () => {
    // Bounds memory on a long-running instance. Fill past the cap and confirm the
    // map stops growing rather than expanding without limit.
    for (let i = 0; i < 5_100; i += 1) {
      await recordQuestions(
        response([{ label: `item-${i}`, verdict: 'check_with_staff', reason: 'r', sourceRuleId: null }]),
      );
    }
    expect(getOpsSnapshot().rows.length).toBeLessThanOrEqual(5_000);
  });
});
