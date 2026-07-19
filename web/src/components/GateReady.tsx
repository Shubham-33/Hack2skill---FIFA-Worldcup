'use client';

/**
 * The GateReady interactive shell.
 *
 * UX decisions worth noting:
 *  - One input, not tabs. The textarea accepts a question in any language and a photo
 *    can be attached to the same box; the app detects what it got rather than making
 *    the user classify their own input first.
 *  - Degradation is visible. The answering tier is always shown, so a fallback answer is
 *    never silently passed off as a live one.
 *  - "Load sample" means the demo works on a cold click with no typing.
 */

import { useCallback, useRef, useState } from 'react';

import VerdictCard from './VerdictCard';
import { buildCalendarUrl } from '@/lib/deterministic';
import { findVenue, VENUES } from '@/lib/policies';
import type { AccessProfile, CheckResponse, ItemVerdict, Mode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODES: ReadonlyArray<{ id: Mode; label: string; hint: string }> = [
  { id: 'fan', label: 'Fan', hint: 'Check what you can bring in' },
  { id: 'access', label: 'Accessibility', hint: 'Gate routing and facilities' },
  { id: 'staff', label: 'Volunteer', hint: 'Get a script to read aloud' },
];

const PROFILES: ReadonlyArray<{ id: AccessProfile; label: string }> = [
  { id: 'wheelchair', label: 'Wheelchair user' },
  { id: 'ambulatory', label: 'Limited mobility' },
  { id: 'sensory', label: 'Sensory sensitivity' },
  { id: 'medical_device', label: 'Medical device or medication' },
  { id: 'service_animal', label: 'Service animal' },
  { id: 'companion', label: 'Travelling with a companion' },
];

const SAMPLE_QUERY =
  'I have a power bank, a backpack, my insulin pen and a flag with a pole. What can I take in?';

/** How the answering tier is described to the user. */
const TIER_LABELS: Readonly<Record<CheckResponse['tier'], string>> = {
  gemini: 'Gemini 2.5 Flash',
  nvidia: 'NVIDIA fallback',
  deterministic: 'Offline rules',
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** How long before kickoff the calendar reminder is placed. */
const ARRIVAL_BUFFER_HOURS = 3;

/** Format a Date as the compact UTC stamp Google Calendar expects. */
function toCalendarStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * Build a Google Calendar link carrying the fan's personalised checklist.
 *
 * URL-spec only: this opens Calendar in the user's already-authenticated tab with the
 * event prefilled. No OAuth, no consent screen, no token storage — and the fan keeps
 * their bring/don't-bring list somewhere they will actually see it on match day.
 */
function buildChecklistCalendarUrl(items: ItemVerdict[], venueName: string): string {
  const venue = findVenue(venueName);

  const bring = items.filter((i) => i.verdict === 'allowed').map((i) => `• ${i.label}`);
  const leave = items
    .filter((i) => i.verdict === 'not_allowed')
    .map((i) => `• ${i.label}${i.fix ? ` — ${i.fix}` : ''}`);
  const ask = items.filter((i) => i.verdict === 'check_with_staff').map((i) => `• ${i.label}`);

  const details = [
    'Your GateReady checklist',
    '',
    bring.length ? `OK to bring:\n${bring.join('\n')}` : '',
    leave.length ? `\nLeave behind:\n${leave.join('\n')}` : '',
    ask.length ? `\nAsk staff about:\n${ask.join('\n')}` : '',
    `\nBag check: ${venue.bagCheckLocation} (${venue.bagCheckCost})`,
    `Accessible gate: ${venue.accessibleGate} · Medical lane: ${venue.medicalLaneGate}`,
    '',
    'Adjust the time to match your kickoff.',
  ]
    .filter(Boolean)
    .join('\n');

  // Default to tomorrow evening; the fan edits the time in Calendar before saving.
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + ARRIVAL_BUFFER_HOURS * 60 * 60 * 1000);

  return buildCalendarUrl(
    `Leave for ${venue.venue} — bag checklist`,
    toCalendarStamp(start),
    toCalendarStamp(end),
    details,
    venue.mapsDestination,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GateReady() {
  const [mode, setMode] = useState<Mode>('fan');
  const [venue, setVenue] = useState<string>(VENUES[0].venue);
  const [query, setQuery] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [imageName, setImageName] = useState<string | undefined>();
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleProfile = useCallback((id: AccessProfile) => {
    setProfiles((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }, []);

  const handleFile = useCallback((file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That image is over 4MB. Please choose a smaller one.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setImageName(file.name);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const submit = useCallback(async () => {
    if (!query.trim() && !imageDataUrl) {
      setError('Type a question or attach a photo of your bag.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, imageDataUrl, venue, mode, profiles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      setResult(data as CheckResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [query, imageDataUrl, venue, mode, profiles]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* ── Mode selector ─────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Choose who you are" className="mb-6 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            type="button"
            aria-selected={mode === m.id}
            aria-controls="gateready-panel"
            onClick={() => setMode(m.id)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-600 ${
              mode === m.id
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {m.label}
            <span className="sr-only"> — {m.hint}</span>
          </button>
        ))}
      </div>

      <div id="gateready-panel" role="tabpanel">
        {/* ── Venue ───────────────────────────────────────────────────── */}
        <label htmlFor="venue" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Venue
        </label>
        <select
          id="venue"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          className="mt-1 mb-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          {VENUES.map((v) => (
            <option key={v.venue} value={v.venue}>
              {v.venue} — {v.city}
            </option>
          ))}
        </select>

        {/* ── Accessibility profiles ──────────────────────────────────── */}
        {mode === 'access' && (
          <fieldset className="mb-5 rounded-lg border border-slate-300 p-4 dark:border-slate-600">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              What support do you need? Choose any that apply.
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PROFILES.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={profiles.includes(p.id)}
                    onChange={() => toggleProfile(p.id)}
                    className="h-4 w-4 rounded border-slate-400 focus-visible:ring-2 focus-visible:ring-sky-600"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* ── The single input ────────────────────────────────────────── */}
        <label htmlFor="query" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Ask in any language, or attach a photo of your bag
        </label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className="mt-1 rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-sky-600 dark:border-slate-600 dark:bg-slate-900"
        >
          <textarea
            id="query"
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
            }}
            placeholder="¿Puedo llevar una batería externa? · Can I bring a tripod? · 傘は持ち込めますか？"
            aria-describedby="query-hint"
            className="w-full resize-y rounded-t-lg bg-transparent px-3 py-2 text-slate-900 focus:outline-none dark:text-slate-100"
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Attach photo
            </button>
            <button
              type="button"
              onClick={() => setQuery(SAMPLE_QUERY)}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Load sample
            </button>
            {imageName && (
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Attached: {imageName}
                <button
                  type="button"
                  onClick={() => {
                    setImageDataUrl(undefined);
                    setImageName(undefined);
                  }}
                  className="ml-1.5 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                >
                  remove
                </button>
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Attach a photo of your bag"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        </div>
        <p id="query-hint" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          You can also drag a photo here. Press ⌘/Ctrl + Enter to check. Photos are processed in
          memory and never stored.
        </p>

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-600 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {loading ? 'Checking…' : 'Check my bag'}
        </button>

        {/* ── Status region ───────────────────────────────────────────── */}
        <div role="status" aria-live="polite" className="mt-4">
          {loading && (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
              ))}
            </div>
          )}
          {error && (
            <p className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
              {error}
            </p>
          )}
          {loading && <span className="sr-only">Checking your items against venue policy…</span>}
        </div>

        {/* ── Results ─────────────────────────────────────────────────── */}
        {result && !loading && (
          <section aria-label="Results" className="mt-6">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                Detected: {result.languageName}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {result.venue}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  result.tier === 'deterministic'
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Answered by: {TIER_LABELS[result.tier]}
              </span>
            </div>

            <div className="space-y-3">
              {result.items.map((item, i) => (
                <VerdictCard key={`${item.label}-${i}`} item={item} />
              ))}
            </div>

            {/* Dispatch — URL-spec only, so no OAuth and no stored tokens. */}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={buildChecklistCalendarUrl(result.items, result.venue)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Add checklist to Google Calendar
              </a>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  findVenue(result.venue).mapsDestination,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Directions in Google Maps
              </a>
            </div>

            {result.staffScript && (
              <div className="mt-5 rounded-lg border border-slate-300 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Read this to the fan
                </h2>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-slate-200">
                  {result.staffScript}
                </pre>
              </div>
            )}

            {result.accessGuidance && (
              <div className="mt-5 rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Your route
                </h2>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-slate-600 dark:text-slate-400">Gate</dt>
                    <dd className="text-slate-900 dark:text-slate-100">{result.accessGuidance.gate}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-600 dark:text-slate-400">Step-free route</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {result.accessGuidance.elevatorRoute}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-600 dark:text-slate-400">Companion seating</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {result.accessGuidance.companionSeating}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-600 dark:text-slate-400">Quiet room</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {result.accessGuidance.quietRoom}
                    </dd>
                  </div>
                </dl>
                {result.accessGuidance.notes.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                    {result.accessGuidance.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
                <a
                  href={result.accessGuidance.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Directions in Google Maps
                </a>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
