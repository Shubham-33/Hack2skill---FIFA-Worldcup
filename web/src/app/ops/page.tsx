/**
 * Organiser view.
 *
 * The premise stated plainly in the header: this is not a simulated feed. It is the
 * aggregate of questions real fans asked, which is what makes it actionable.
 */

import type { Metadata } from 'next';

import Link from 'next/link';

import OpsBoard from '@/components/OpsBoard';

export const metadata: Metadata = {
  title: 'GateReady — Operations',
  description: 'Live operational intelligence aggregated from real fan questions.',
};

/** Always render fresh; the tallies change with traffic. */
export const dynamic = 'force-dynamic';

export default function OpsPage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <nav aria-label="Breadcrumb" className="mb-2 text-sm">
            <Link
              href="/"
              className="text-slate-600 underline hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-slate-400 dark:hover:text-slate-100"
            >
              ← Back to GateReady
            </Link>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Operations
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Every figure below is derived from questions fans actually asked this tool. There is no
            simulated feed and no turnstile telemetry — which is exactly why these numbers are
            worth acting on.
          </p>
        </div>
      </header>

      <main id="main">
        <OpsBoard />
      </main>

      <footer className="mt-8 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl px-4 py-6 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Aggregate counts only. Raw questions are never stored, photos are never retained, and
            no identifier of any kind is recorded — so nothing here can be traced to an individual.
          </p>
        </div>
      </footer>
    </>
  );
}
