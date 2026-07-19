/**
 * Tiers 1 and 2 — the LLM layer.
 *
 * All network calls are mocked, so this suite runs offline and in CI without secrets.
 * The tests that matter most here are the failure paths: every tier must degrade
 * cleanly, and no ungrounded answer may reach a fan.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answer,
  buildPrompt,
  callGemini,
  callNvidia,
  enforceCitationIntegrity,
  extractJson,
  normaliseItems,
  splitDataUrl,
} from '@/lib/llm';
import type { ItemVerdict } from '@/lib/types';

const VENUE = 'MetLife Stadium';
const IMAGE = 'data:image/jpeg;base64,QUJD';

/** A well-formed model payload. */
const GOOD_PAYLOAD = {
  language: 'en',
  languageName: 'English',
  items: [{ label: 'power bank', verdict: 'allowed', reason: 'ok', sourceRuleId: 'ALL-2.1' }],
};

/** The subset of an outbound request body these tests assert on. */
interface OutboundBody {
  model?: string;
  contents?: Array<{ parts: Array<Record<string, { mime_type?: string }>> }>;
  messages?: Array<{ content: Array<{ type: string }> }>;
}

/** Read the JSON body from a mocked fetch call without leaking `any` into the test. */
function requestBody(spy: { mock: { calls: unknown[][] } }, call = 0): OutboundBody {
  const init = spy.mock.calls[call][1] as { body: string };
  return JSON.parse(init.body) as OutboundBody;
}

/** A mocked Gemini success response carrying the given payload. */
function geminiOk(payload: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.GEMINI_API_KEY = '';
  process.env.NVIDIA_API_KEY = '';
  delete process.env.NVIDIA_MODEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildPrompt', () => {
  it('inlines the policy rows so the model is grounded', () => {
    const prompt = buildPrompt('can I bring a tripod', VENUE, 'fan');
    expect(prompt).toContain('POLICY RULES');
    expect(prompt).toContain('ALL-2.3');
    expect(prompt).toContain('MetLife Stadium');
    expect(prompt).toContain('USER INPUT: can I bring a tripod');
  });

  it('substitutes image guidance when there is no text query', () => {
    expect(buildPrompt('', VENUE, 'fan')).toContain('see attached image');
  });
});

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a fenced object', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses an object padded with prose', () => {
    expect(extractJson('Here you go: {"a":1} hope that helps')).toEqual({ a: 1 });
  });

  it('throws when there is no object at all', () => {
    expect(() => extractJson('no json here')).toThrow(/No JSON object/);
  });

  it('throws when braces are inverted', () => {
    expect(() => extractJson('} {')).toThrow(/No JSON object/);
  });
});

describe('normaliseItems', () => {
  it('throws when items is missing', () => {
    expect(() => normaliseItems({})).toThrow(/missing items/);
  });

  it('throws when the payload is null', () => {
    expect(() => normaliseItems(null)).toThrow(/missing items/);
  });

  it('downgrades an unrecognised verdict rather than trusting it', () => {
    const items = normaliseItems({ items: [{ label: 'x', verdict: 'definitely_fine', reason: 'r' }] });
    expect(items[0].verdict).toBe('check_with_staff');
  });

  it('supplies defaults for missing fields', () => {
    const items = normaliseItems({ items: [{}] });
    expect(items[0]).toMatchObject({
      label: 'item',
      verdict: 'check_with_staff',
      reason: 'No reason supplied.',
      sourceRuleId: null,
    });
    expect(items[0].condition).toBeUndefined();
    expect(items[0].fix).toBeUndefined();
  });

  it('preserves well-formed fields', () => {
    const items = normaliseItems({
      items: [
        {
          label: 'power bank',
          verdict: 'allowed',
          reason: 'ok',
          condition: 'under 100Wh',
          fix: 'none',
          sourceRuleId: 'ALL-2.1',
        },
      ],
    });
    expect(items[0]).toMatchObject({ condition: 'under 100Wh', fix: 'none', sourceRuleId: 'ALL-2.1' });
  });

  it('treats an empty string source id as no citation', () => {
    const items = normaliseItems({ items: [{ label: 'x', verdict: 'allowed', reason: 'r', sourceRuleId: '' }] });
    expect(items[0].sourceRuleId).toBeNull();
  });
});

describe('enforceCitationIntegrity', () => {
  const base = { label: 'x', reason: 'r' };

  it('passes through an item with no citation', () => {
    const items: ItemVerdict[] = [{ ...base, verdict: 'check_with_staff', sourceRuleId: null }];
    expect(enforceCitationIntegrity(items)[0].verdict).toBe('check_with_staff');
  });

  it('passes through a citation that matches its rule', () => {
    const items: ItemVerdict[] = [{ ...base, verdict: 'allowed', sourceRuleId: 'ALL-2.1' }];
    expect(enforceCitationIntegrity(items)[0]).toMatchObject({
      verdict: 'allowed',
      sourceRuleId: 'ALL-2.1',
    });
  });

  it('downgrades a fabricated rule id', () => {
    const items: ItemVerdict[] = [{ ...base, verdict: 'allowed', sourceRuleId: 'FAKE-9.9' }];
    expect(enforceCitationIntegrity(items)[0]).toMatchObject({
      verdict: 'check_with_staff',
      sourceRuleId: null,
    });
  });

  it('downgrades a citation whose rule contradicts the verdict', () => {
    // ALL-2.2 (professional camera) is not_allowed; claiming "allowed" is ungrounded.
    const items: ItemVerdict[] = [{ ...base, verdict: 'allowed', sourceRuleId: 'ALL-2.2' }];
    const result = enforceCitationIntegrity(items)[0];
    expect(result.verdict).toBe('check_with_staff');
    expect(result.sourceRuleId).toBeNull();
    expect(result.fix).toContain('volunteer');
  });

  it('keeps an existing fix when downgrading', () => {
    const items: ItemVerdict[] = [
      { ...base, verdict: 'allowed', sourceRuleId: 'ALL-2.2', fix: 'Original fix.' },
    ];
    expect(enforceCitationIntegrity(items)[0].fix).toBe('Original fix.');
  });
});

describe('splitDataUrl', () => {
  it('splits a valid data URL', () => {
    expect(splitDataUrl(IMAGE)).toEqual({ mimeType: 'image/jpeg', data: 'QUJD' });
  });

  it('returns null for a malformed data URL', () => {
    expect(splitDataUrl('not-a-data-url')).toBeNull();
  });
});

describe('callGemini', () => {
  it('returns normalised items on success', async () => {
    vi.stubGlobal('fetch', geminiOk(GOOD_PAYLOAD));
    const result = await callGemini('prompt', 'key');
    expect(result.items[0].sourceRuleId).toBe('ALL-2.1');
    expect(result.language).toBe('en');
  });

  it('attaches inline image data when given a data URL', async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD_PAYLOAD) }] } }],
      }),
    }));
    vi.stubGlobal('fetch', spy);
    await callGemini('prompt', 'key', IMAGE);
    const body = requestBody(spy);
    expect(body.contents?.[0].parts[1].inline_data?.mime_type).toBe('image/jpeg');
  });

  it('ignores a malformed image rather than failing the call', async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD_PAYLOAD) }] } }],
      }),
    }));
    vi.stubGlobal('fetch', spy);
    await callGemini('prompt', 'key', 'garbage');
    const body = requestBody(spy);
    expect(body.contents?.[0].parts).toHaveLength(1);
  });

  it('throws on a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })));
    await expect(callGemini('p', 'k')).rejects.toThrow('Gemini 429');
  });

  it('throws when the response carries no text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    await expect(callGemini('p', 'k')).rejects.toThrow(/no text/);
  });

  it('defaults language fields when the model omits them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ items: GOOD_PAYLOAD.items }) }] } },
          ],
        }),
      })),
    );
    const result = await callGemini('p', 'k');
    expect(result).toMatchObject({ language: 'en', languageName: 'English' });
  });
});

describe('callNvidia', () => {
  const nvidiaOk = (payload: unknown) =>
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    }));

  it('returns normalised items on success', async () => {
    vi.stubGlobal('fetch', nvidiaOk(GOOD_PAYLOAD));
    const result = await callNvidia('p', 'k', 'model');
    expect(result.items[0].sourceRuleId).toBe('ALL-2.1');
  });

  it('attaches the image as an image_url part', async () => {
    const spy = nvidiaOk(GOOD_PAYLOAD);
    vi.stubGlobal('fetch', spy);
    await callNvidia('p', 'k', 'model', IMAGE);
    const body = requestBody(spy);
    expect(body.messages?.[0].content[1].type).toBe('image_url');
  });

  it('throws on a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(callNvidia('p', 'k', 'm')).rejects.toThrow('NVIDIA 500');
  });

  it('throws when the response carries no content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    await expect(callNvidia('p', 'k', 'm')).rejects.toThrow(/no content/);
  });

  it('defaults language fields when the model omits them', async () => {
    vi.stubGlobal('fetch', nvidiaOk({ items: GOOD_PAYLOAD.items }));
    const result = await callNvidia('p', 'k', 'm');
    expect(result).toMatchObject({ language: 'en', languageName: 'English' });
  });
});

describe('answer — the resilience stack', () => {
  it('falls straight to the deterministic tier when no keys are configured', async () => {
    const result = await answer('can I bring a tripod', VENUE, 'fan', []);
    expect(result.tier).toBe('deterministic');
    expect(result.items[0].sourceRuleId).toBe('ALL-2.3');
  });

  it('uses Gemini when it succeeds', async () => {
    process.env.GEMINI_API_KEY = 'k';
    vi.stubGlobal('fetch', geminiOk(GOOD_PAYLOAD));
    const result = await answer('power bank', VENUE, 'fan', []);
    expect(result.tier).toBe('gemini');
  });

  it('fails over to NVIDIA when Gemini errors', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.NVIDIA_API_KEY = 'n';
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        if (call === 1) return { ok: false, status: 429, json: async () => ({}) };
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: JSON.stringify(GOOD_PAYLOAD) } }] }),
        };
      }),
    );
    const result = await answer('power bank', VENUE, 'fan', []);
    expect(result.tier).toBe('nvidia');
  });

  it('honours a custom NVIDIA model from the environment', async () => {
    process.env.NVIDIA_API_KEY = 'n';
    process.env.NVIDIA_MODEL = 'custom/model';
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(GOOD_PAYLOAD) } }] }),
    }));
    vi.stubGlobal('fetch', spy);
    await answer('power bank', VENUE, 'fan', []);
    expect(requestBody(spy).model).toBe('custom/model');
  });

  it('falls through to deterministic when every tier fails', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.NVIDIA_API_KEY = 'n';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const result = await answer('tripod', VENUE, 'fan', []);
    expect(result.tier).toBe('deterministic');
  });

  it('treats an empty item list as a failure and degrades', async () => {
    process.env.GEMINI_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ language: 'en', languageName: 'English', items: [] }) }],
              },
            },
          ],
        }),
      })),
    );
    const result = await answer('tripod', VENUE, 'fan', []);
    expect(result.tier).toBe('deterministic');
  });

  it('adds access guidance in access mode on the LLM path', async () => {
    process.env.GEMINI_API_KEY = 'k';
    vi.stubGlobal('fetch', geminiOk(GOOD_PAYLOAD));
    const result = await answer('wheelchair', VENUE, 'access', ['wheelchair']);
    expect(result.accessGuidance?.gate).toBe('Gate C');
  });

  it('adds a staff script in staff mode on the LLM path', async () => {
    process.env.GEMINI_API_KEY = 'k';
    vi.stubGlobal('fetch', geminiOk(GOOD_PAYLOAD));
    const result = await answer('power bank', VENUE, 'staff', []);
    expect(result.staffScript).toContain('✅');
  });
});
