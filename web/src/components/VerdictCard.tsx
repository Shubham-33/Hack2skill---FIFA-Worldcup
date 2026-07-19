/**
 * A single item verdict.
 *
 * The three states are distinguished by icon, border colour, and an explicit text label —
 * never by colour alone, so the card remains readable for colour-blind users and in
 * high-contrast mode.
 */

import type { ItemVerdict, Verdict } from '@/lib/types';

/** Presentation for each verdict state. */
const VERDICT_STYLES: Readonly<
  Record<Verdict, { icon: string; label: string; border: string; chip: string }>
> = {
  allowed: {
    icon: '✓',
    label: 'Allowed',
    border: 'border-l-emerald-600',
    chip: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  },
  not_allowed: {
    icon: '✕',
    label: 'Not allowed',
    border: 'border-l-rose-600',
    chip: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  },
  check_with_staff: {
    icon: '!',
    label: 'Check with staff',
    border: 'border-l-amber-600',
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
};

export default function VerdictCard({ item }: { item: ItemVerdict }) {
  const style = VERDICT_STYLES[item.verdict];

  return (
    <article
      className={`rounded-lg border border-l-4 ${style.border} border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="text-lg font-bold">
          {style.icon}
        </span>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{item.label}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.chip}`}>
          {style.label}
        </span>
      </header>

      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{item.reason}</p>

      {item.condition && (
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium">Condition:</span> {item.condition}
        </p>
      )}

      {item.fix && (
        <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          <span className="font-medium">What to do:</span> {item.fix}
        </p>
      )}

      <footer className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
        {item.sourceRuleId ? (
          <>
            Source: rule <code className="font-mono">{item.sourceRuleId}</code>
          </>
        ) : (
          'No published rule matched — this needs a human decision.'
        )}
      </footer>
    </article>
  );
}
