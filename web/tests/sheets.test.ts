/**
 * Google Sheets as the live policy source.
 *
 * The behaviour that matters here is failure behaviour: a broken, slow, or malformed
 * Sheet must degrade freshness and never availability. Every path below that ends in a
 * fallback is protecting a fan standing at a gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getActivePolicies, hasLivePolicies, POLICIES, setLivePolicies } from '@/lib/policies';
import {
  activeRuleCount,
  buildSheetCsvUrl,
  isUsingLiveSheet,
  parseCsv,
  refreshPolicies,
  resetSheetCache,
  rowsToPolicies,
} from '@/lib/sheets';

const HEADER = 'rule_id,venue,item,aliases,verdict,condition,reason,fix,category';

/** A minimal valid Sheet export. */
const CSV_OK = `${HEADER}
SHEET-1.1,ALL,vuvuzela,"horn, plastic horn",not_allowed,,Amplified noise interferes with safety announcements,Leave it outside,fan_gear
SHEET-1.2,ALL,sunglasses,"shades",allowed,,Permitted,,personal`;

function csvResponse(body: string, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, text: async () => body }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetSheetCache();
  delete process.env.GOOGLE_SHEETS_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSheetCache();
});

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('a,b\n"x,y",z')).toEqual([
      ['a', 'b'],
      ['x,y', 'z'],
    ]);
  });

  it('handles escaped quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
  });

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",z')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'z'],
    ]);
  });

  it('strips CR from CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('keeps a trailing row without a newline', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toHaveLength(3);
  });

  it('preserves empty trailing cells', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('rowsToPolicies', () => {
  it('maps well-formed rows', () => {
    const rules = rowsToPolicies(parseCsv(CSV_OK));
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      ruleId: 'SHEET-1.1',
      item: 'vuvuzela',
      verdict: 'not_allowed',
      aliases: ['horn', 'plastic horn'],
      fix: 'Leave it outside',
    });
  });

  it('returns nothing when there are no data rows', () => {
    expect(rowsToPolicies([['rule_id', 'item', 'verdict']])).toEqual([]);
  });

  it('returns nothing for empty input', () => {
    expect(rowsToPolicies([])).toEqual([]);
  });

  it('returns nothing when a required column is missing', () => {
    expect(rowsToPolicies(parseCsv('rule_id,item\nX,thing'))).toEqual([]);
  });

  it('resolves columns by header name, not position', () => {
    const rules = rowsToPolicies(parseCsv('verdict,item,rule_id\nallowed,hat,R-1'));
    expect(rules[0]).toMatchObject({ ruleId: 'R-1', item: 'hat', verdict: 'allowed' });
  });

  it('tolerates case and whitespace in headers', () => {
    const rules = rowsToPolicies(parseCsv(' Rule_ID , Item , Verdict \nR-1,hat,allowed'));
    expect(rules).toHaveLength(1);
  });

  it('skips a row with an unrecognised verdict rather than guessing', () => {
    const rules = rowsToPolicies(parseCsv('rule_id,item,verdict\nR-1,hat,probably_fine'));
    expect(rules).toEqual([]);
  });

  it('skips rows missing a rule id or item', () => {
    const rules = rowsToPolicies(parseCsv('rule_id,item,verdict\n,hat,allowed\nR-2,,allowed'));
    expect(rules).toEqual([]);
  });

  it('applies defaults for optional columns', () => {
    const rules = rowsToPolicies(parseCsv('rule_id,item,verdict\nR-1,Hat,ALLOWED'));
    expect(rules[0]).toMatchObject({
      venue: 'ALL',
      item: 'hat',
      category: 'general',
      reason: 'No reason published for this rule.',
    });
    expect(rules[0].condition).toBeUndefined();
    expect(rules[0].fix).toBeUndefined();
    expect(rules[0].aliases).toEqual([]);
  });

  it('tolerates short rows', () => {
    const rules = rowsToPolicies([
      ['rule_id', 'item', 'verdict', 'reason'],
      ['R-1', 'hat', 'allowed'],
    ]);
    expect(rules).toHaveLength(1);
  });
});

describe('buildSheetCsvUrl', () => {
  it('targets the policies tab by default', () => {
    expect(buildSheetCsvUrl('ABC123')).toBe(
      'https://docs.google.com/spreadsheets/d/ABC123/gviz/tq?tqx=out:csv&sheet=policies',
    );
  });

  it('encodes a custom sheet name', () => {
    expect(buildSheetCsvUrl('ABC', 'my sheet')).toContain('sheet=my%20sheet');
  });
});

describe('refreshPolicies', () => {
  it('does nothing when no sheet is configured', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await refreshPolicies();
    expect(spy).not.toHaveBeenCalled();
    expect(hasLivePolicies()).toBe(false);
  });

  it('installs live rules on success', async () => {
    process.env.GOOGLE_SHEETS_ID = 'sheet-id';
    vi.stubGlobal('fetch', csvResponse(CSV_OK));
    await refreshPolicies();
    expect(isUsingLiveSheet()).toBe(true);
    expect(hasLivePolicies()).toBe(true);
    expect(getActivePolicies()).toHaveLength(2);
    expect(activeRuleCount()).toBe(2);
  });

  it('falls back to seed data on a non-2xx response', async () => {
    process.env.GOOGLE_SHEETS_ID = 'sheet-id';
    vi.stubGlobal('fetch', csvResponse('', false, 404));
    await refreshPolicies();
    expect(isUsingLiveSheet()).toBe(false);
    expect(getActivePolicies()).toBe(POLICIES);
  });

  it('falls back when the fetch throws', async () => {
    process.env.GOOGLE_SHEETS_ID = 'sheet-id';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await refreshPolicies();
    expect(isUsingLiveSheet()).toBe(false);
    expect(getActivePolicies()).toBe(POLICIES);
  });

  it('falls back when the sheet yields no usable rules', async () => {
    process.env.GOOGLE_SHEETS_ID = 'sheet-id';
    vi.stubGlobal('fetch', csvResponse('nonsense\nmore nonsense'));
    await refreshPolicies();
    expect(isUsingLiveSheet()).toBe(false);
    expect(getActivePolicies()).toBe(POLICIES);
  });

  it('does not refetch while the cache is warm', async () => {
    process.env.GOOGLE_SHEETS_ID = 'sheet-id';
    const spy = csvResponse(CSV_OK);
    vi.stubGlobal('fetch', spy);
    await refreshPolicies();
    await refreshPolicies();
    await refreshPolicies();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refetches when forced', async () => {
    process.env.GOOGLE_SHEETS_ID = 'sheet-id';
    const spy = csvResponse(CSV_OK);
    vi.stubGlobal('fetch', spy);
    await refreshPolicies();
    await refreshPolicies(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('live overlay in policies', () => {
  it('ignores an empty rule set so the seed is never wiped out', () => {
    setLivePolicies([]);
    expect(hasLivePolicies()).toBe(false);
    expect(getActivePolicies()).toBe(POLICIES);
  });

  it('clears back to seed data when passed null', () => {
    setLivePolicies([
      { ruleId: 'X-1', venue: 'ALL', item: 'x', aliases: [], verdict: 'allowed', reason: 'r', category: 'c' },
    ]);
    expect(hasLivePolicies()).toBe(true);
    setLivePolicies(null);
    expect(getActivePolicies()).toBe(POLICIES);
  });
});
