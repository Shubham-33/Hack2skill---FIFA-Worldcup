/**
 * Landing page.
 *
 * Server-rendered shell around the interactive client component, so the framing and
 * the safety disclaimer are present in the initial HTML rather than appearing only
 * after hydration.
 */

import Link from 'next/link';

import GateReady from '@/components/GateReady';

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            GateReady
          </h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Know before you go. Don&apos;t miss kickoff.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            The biggest cause of delay at a stadium gate isn&apos;t security — it&apos;s fans
            arriving with something that was never going to get in. Ask in any language, or show us
            your bag.
          </p>
          <nav aria-label="Sections" className="mt-3">
            <Link
              href="/ops"
              className="text-sm text-slate-600 underline hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Organiser view →
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <GateReady />
      </main>

      <footer className="mt-8 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Policy data here is demonstration data modelled on real venue policies. It is not
            official FIFA guidance — always confirm with your venue before travelling.
          </p>
          <p className="mt-2">
            Photos are processed in memory and never stored. No accounts, no cookies, no tracking.
          </p>
        </div>
      </footer>
    </>
  );
}
