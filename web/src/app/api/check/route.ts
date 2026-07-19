/**
 * `POST /api/check` — the single endpoint behind every mode.
 *
 * Security posture:
 *  - Input is length-capped before it reaches any model, bounding both cost and abuse.
 *  - Uploaded images are held in memory for the duration of the request and never written
 *    to disk, never logged, never forwarded anywhere but the model provider.
 *  - Raw free text is never logged. Only the matched canonical item is aggregated, so the
 *    operational view cannot surface an individual.
 *  - No cookies, no sessions, no accounts, no IP retention.
 */

import { NextResponse } from 'next/server';

import { answer } from '@/lib/llm';
import { recordQuestions } from '@/lib/oplog';
import { DEFAULT_VENUE } from '@/lib/policies';
import type { AccessProfile, CheckRequest, Mode } from '@/lib/types';

/** Cap on free-text input. Long enough for a real question, short enough to bound cost. */
const MAX_QUERY_LENGTH = 600;
/** Cap on the base64 image payload (~4MB decoded). Rejected outright above this. */
const MAX_IMAGE_CHARS = 5_600_000;

const VALID_MODES: readonly Mode[] = ['fan', 'access', 'staff'];
const VALID_PROFILES: readonly AccessProfile[] = [
  'wheelchair',
  'ambulatory',
  'sensory',
  'medical_device',
  'service_animal',
  'companion',
];

/** Narrow an untrusted value to a supported mode. */
function coerceMode(value: unknown): Mode {
  return VALID_MODES.includes(value as Mode) ? (value as Mode) : 'fan';
}

/** Filter an untrusted array down to recognised accessibility profiles. */
function coerceProfiles(value: unknown): AccessProfile[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is AccessProfile => VALID_PROFILES.includes(v as AccessProfile));
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CheckRequest;
  try {
    body = (await request.json()) as CheckRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = typeof body.query === 'string' ? body.query.slice(0, MAX_QUERY_LENGTH).trim() : '';
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : undefined;

  if (imageDataUrl && imageDataUrl.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: 'Image too large. Please use an image under 4MB.' }, { status: 413 });
  }
  if (!query && !imageDataUrl) {
    return NextResponse.json({ error: 'Provide a question or a photo.' }, { status: 400 });
  }

  const venue = typeof body.venue === 'string' ? body.venue : DEFAULT_VENUE;
  const mode = coerceMode(body.mode);
  const profiles = coerceProfiles(body.profiles);

  const result = await answer(query, venue, mode, profiles, imageDataUrl);

  // Aggregate for the operational view. Matched item labels only — never raw input.
  await recordQuestions(result);

  return NextResponse.json(result, {
    headers: {
      // Answers are personal to the request and must not be cached by intermediaries.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
