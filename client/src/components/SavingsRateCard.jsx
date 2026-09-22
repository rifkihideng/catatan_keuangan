import { PiggyBank, TrendingDown, TrendingUp } from 'lucide-react';
import { formatRupiah, formatRupiahCompact } from '../format';

const R = 34;
const CIRC = 2 * Math.PI * R;

export default function SavingsRateCard({ income = 0, expense = 0, monthly = [], periodLabel }) {
  const incomeN = Number(income) || 0;
  const recentMonths = (Array.isArray(monthly) ? monthly : [])
    .slice()
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .slice(0, 6);
  const expenseN = Number(expense) || 0;
  const savings = incomeN - expenseN;
  const rate = incomeN > 0 ? (savings / incomeN) * 100 : null;
  const sum = incomeN + expenseN;
  const incomePct = sum > 0 ? (incomeN / sum) * 100 : 0;
  const expensePct = sum > 0 ? (expenseN / sum) * 100 : 0;
  const ringPct = rate === null ? 0 : Math.min(Math.max(Math.abs(rate), 0), 100);
  const ringColor = savings >= 0 ? '#10b981' : '#f43f5e';

  return (
    <div className="card flex h-full flex-col p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <PiggyBank className="h-5 w-5" />
        </span>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Pemasukan vs Pengeluaran
        </h2>
        {periodLabel && (
          <span className="ml-auto rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            {periodLabel}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 88 88" className="h-24 w-24 -rotate-90">
            <circle
              cx="44"
              cy="44"
              r={R}
              fill="none"
              strokeWidth="8"
              className="stroke-slate-100 dark:stroke-slate-700"
            />
            <circle
              cx="44"
              cy="44"
              r={R}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              stroke={ringColor}
              strokeDasharray={`${(CIRC * ringPct) / 100} ${CIRC}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-extrabold leading-none text-slate-900 dark:text-white">
              {rate === null ? '—' : `${Math.abs(rate).toFixed(0)}%`}
            </span>
            <span className="mt-0.5 text-[10px] font-medium text-slate-400">tabungan</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600" /> Pemasukan
            </span>
            <span className="font-semibold text-emerald-600">{formatRupiah(incomeN)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <TrendingDown className="h-4 w-4 shrink-0 text-rose-600" /> Pengeluaran
            </span>
            <span className="font-semibold text-rose-600">{formatRupiah(expenseN)}</span>
          </div>
          <p
            className={`text-sm font-bold ${
              savings >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {savings >= 0 ? 'Menabung' : 'Defisit'} {formatRupiahCompact(Math.abs(savings))}
          </p>
        </div>
      </div>

      {recentMonths.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Per bulan (semua data)
          </h3>
          <ul className="space-y-1.5">
            {recentMonths.map((m) => {
              const mRate = m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : null;
              return (
                <li key={m.month} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 font-medium text-slate-500 dark:text-slate-300">
                    {monthShort(m.month)}
                  </span>
                  <span className="flex-1 tabular-nums text-emerald-600">
                    +{formatRupiahCompact(m.income)}
                  </span>
                  <span className="flex-1 tabular-nums text-rose-600">
                    −{formatRupiahCompact(m.expense)}
                  </span>
                  <span
                    className={`w-10 shrink-0 text-right font-semibold tabular-nums ${
                      mRate === null
                        ? 'text-slate-400'
                        : m.income >= m.expense
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {mRate === null ? '—' : `${Math.abs(mRate).toFixed(0)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="bg-emerald-500" style={{ width: `${incomePct}%` }} />
          <div className="bg-rose-500" style={{ width: `${expensePct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Pemasukan{' '}
            {incomePct.toFixed(0)}%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Pengeluaran{' '}
            {expensePct.toFixed(0)}%
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {incomeN === 0
            ? 'Belum ada pemasukan tercatat.'
            : savings >= 0
              ? 'Kamu menabung sebagian dari pemasukanmu.'
              : 'Pengeluaran melebihi pemasukan.'}
        </p>
      </div>
    </div>
  );
}

function monthShort(m) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('id-ID', {
    month: 'short',
    year: 'numeric',
  });
}
