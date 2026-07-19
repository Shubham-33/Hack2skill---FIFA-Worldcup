/**
 * API routes.
 *
 * These tests exercise the request-validation surface directly: oversized payloads,
 * malformed JSON, and untrusted enum values are where a public endpoint gets abused.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/check/route';
import { GET } from '@/app/api/ops/route';
import { resetOpsLog } from '@/lib/oplog';
import { resetSheetCache } from '@/lib/sheets';

/** Build a Request with a JSON body. */
function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetOpsLog();
  vi.restoreAllMocks();
  process.env.GEMINI_API_KEY = '';
  process.env.NVIDIA_API_KEY = '';
});

describe('POST /api/check', () => {
  it('rejects a malformed JSON body', async () => {
    const request = new Request('http://localhost/api/check', { method: 'POST', body: 'not json' });
    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it('rejects a request with neither query nor image', async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
  });

  it('rejects an oversized image', async () => {
    const response = await POST(jsonRequest({ imageDataUrl: 'x'.repeat(5_600_001) }));
    expect(response.status).toBe(413);
  });

  it('answers a valid query and sets no-store', async () => {
    const response = await POST(jsonRequest({ query: 'can I bring a tripod' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const body = await response.json();
    expect(body.items[0].sourceRuleId).toBe('ALL-2.3');
  });

  it('accepts an image with no text query', async () => {
    const response = await POST(jsonRequest({ imageDataUrl: 'data:image/jpeg;base64,QUJD' }));
    expect(response.status).toBe(200);
  });

  it('truncates an over-long query rather than rejecting it', async () => {
    const response = await POST(jsonRequest({ query: `tripod ${'x'.repeat(1000)}` }));
    expect(response.status).toBe(200);
  });

  it('coerces an unrecognised mode to fan', async () => {
    const response = await POST(jsonRequest({ query: 'tripod', mode: 'admin' }));
    await expect(response.json()).resolves.toMatchObject({ mode: 'fan' });
  });

  it('honours a valid mode', async () => {
    const response = await POST(jsonRequest({ query: 'backpack', mode: 'staff' }));
    const body = await response.json();
    expect(body.mode).toBe('staff');
    expect(body.staffScript).toBeTruthy();
  });

  it('filters unrecognised accessibility profiles', async () => {
    const response = await POST(
      jsonRequest({ query: 'wheelchair', mode: 'access', profiles: ['wheelchair', 'hacker'] }),
    );
    const body = await response.json();
    expect(body.accessGuidance.notes).toHaveLength(1);
  });

  it('ignores a non-array profiles value', async () => {
    const response = await POST(
      jsonRequest({ query: 'wheelchair', mode: 'access', profiles: 'wheelchair' }),
    );
    await expect(response.json()).resolves.toMatchObject({ accessGuidance: { notes: [] } });
  });

  it('falls back to the default venue for an unknown venue', async () => {
    const response = await POST(jsonRequest({ query: 'tripod', venue: 'Nowhere Stadium' }));
    await expect(response.json()).resolves.toMatchObject({ venue: 'MetLife Stadium' });
  });

  it('honours a known venue', async () => {
    const response = await POST(jsonRequest({ query: 'tripod', venue: 'SoFi Stadium' }));
    await expect(response.json()).resolves.toMatchObject({ venue: 'SoFi Stadium' });
  });

  it('ignores a non-string query', async () => {
    const response = await POST(jsonRequest({ query: 42, imageDataUrl: 'data:image/png;base64,QQ==' }));
    expect(response.status).toBe(200);
  });

  it('ignores a non-string image value', async () => {
    const response = await POST(jsonRequest({ query: 'tripod', imageDataUrl: 42 }));
    expect(response.status).toBe(200);
  });
});

describe('GET /api/ops', () => {
  it('returns an empty snapshot before any traffic', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      rows: [],
      languages: [],
      totalQuestions: 0,
      suggestions: [],
    });
  });

  it('reflects traffic recorded through the check route', async () => {
    await POST(jsonRequest({ query: 'can I bring a backpack' }));
    const body = await (await GET()).json();
    expect(body.totalQuestions).toBeGreaterThan(0);
    expect(body.rows[0].item).toBe('backpack');
  });

  it('sets no-store so intermediaries do not cache operational data', async () => {
    expect((await GET()).headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('GET /api/ops — policy source diagnostic', () => {
  it('reports built-in rules when no Sheet is configured', async () => {
    delete process.env.GOOGLE_SHEETS_ID;
    const body = await (await GET()).json();
    expect(body.policySource).toMatchObject({ live: false, source: 'built-in' });
    expect(body.policySource.ruleCount).toBeGreaterThan(0);
  });

  it('reports the Google Sheet as the source when live rules are loaded', async () => {
    process.env.GOOGLE_SHEETS_ID = 'sheet-id';
    resetSheetCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          'rule_id,item,verdict,reason\nSHEET-1,vuvuzela,not_allowed,Amplified noise',
      })),
    );
    const body = await (await GET()).json();
    expect(body.policySource).toMatchObject({ live: true, source: 'google-sheet', ruleCount: 1 });
    resetSheetCache();
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_SHEETS_ID;
  });
});
