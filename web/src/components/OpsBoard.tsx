'use client';

/**
 * The organiser view.
 *
 * Deliberately plain. The point of this screen is not the chart — it is that every row
 * came from a real fan question, so an operator can act on it without wondering whether
 * the number is real.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { OpsRow } from '@/lib/oplog';
import type { Verdict } from '@/lib/types';

interface OpsPayload {
  rows: OpsRow[];
  languages: Array<{ language: string; count: number }>;
  totalQuestions: number;
  suggestions: string[];
}

const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
  allowed: 'Allowed',
  not_allowed: 'Not allowed',
  check_with_staff: 'Check with staff',
};

const VERDICT_CHIP: Readonly<Record<Verdict, string>> = {
  allowed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  not_allowed: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  check_with_staff: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};

/** Poll interval. Short enough to feel live on stage, long enough to be unobtrusive. */
const REFRESH_MS = 10_000;

export default function OpsBoard() {
  const [data, setData] = useState<OpsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // `cancelled` prevents a state update landing after unmount, which would otherwise
    // happen whenever a poll is in flight as the user navigates away.
    let cancelled = false;

    const tick = async (): Promise<void> => {
      try {
        const res = await fetch('/api/ops');
        if (!res.ok) throw new Error('Could not load operations data.');
        const payload = (await res.json()) as OpsPayload;
        if (cancelled) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load operations data.');
      }
    };

    void tick();
    const id = setInterval(() => void tick(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div role="status" aria-live="polite">
        {error && (
          <p className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
            {error}
          </p>
        )}
      </div>

      {data && data.totalQuestions === 0 && (
        <p className="rounded-lg border border-slate-300 bg-white p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No questions yet. Ask something on the{' '}
          <Link href="/" className="underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
            fan page
          </Link>{' '}
          and it will appear here within ten seconds. This board only ever shows real
          traffic — there is no sample data behind it.
        </p>
      )}

      {data && data.totalQuestions > 0 && (
        <>
          {/* ── Headline counters ─────────────────────────────────────── */}
          <dl className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Questions answered
              </dt>
              <dd className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {data.totalQuestions}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Distinct items
              </dt>
              <dd className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {data.rows.length}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Languages served
              </dt>
              <dd className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {data.languages.length}
              </dd>
            </div>
          </dl>

          {/* ── Suggested actions ─────────────────────────────────────── */}
          {data.suggestions.length > 0 && (
            <section className="mb-6" aria-labelledby="actions-heading">
              <h2
                id="actions-heading"
                className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                Suggested actions
              </h2>
              <ul className="space-y-2">
                {data.suggestions.map((s) => (
                  <li
                    key={s}
                    className="rounded-lg border-l-4 border-l-sky-600 border border-slate-200 bg-white p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Item table ────────────────────────────────────────────── */}
          <section aria-labelledby="items-heading">
            <h2
              id="items-heading"
              className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
              What fans are asking about
            </h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[32rem] border-collapse bg-white text-sm dark:bg-slate-900">
                <caption className="sr-only">
                  Items fans asked about, with how many times each was asked and the verdict given.
                </caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                    <th scope="col" className="px-3 py-2 font-semibold">Item</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Venue</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Verdict</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Asked</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr
                      key={`${r.venue}-${r.item}-${r.verdict}`}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <th scope="row" className="px-3 py-2 text-left font-normal">{r.item}</th>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.venue}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_CHIP[r.verdict]}`}>
                          {VERDICT_LABEL[r.verdict]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Languages ─────────────────────────────────────────────── */}
          <section className="mt-6" aria-labelledby="lang-heading">
            <h2 id="lang-heading" className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Languages served
            </h2>
            <ul className="flex flex-wrap gap-2">
              {data.languages.map((l) => (
                <li
                  key={l.language}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {l.language} · {l.count}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
