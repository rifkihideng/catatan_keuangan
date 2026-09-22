import { Calendar, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { formatRupiah, formatRupiahCompact } from '../format';

export default function SummaryCards({ summary, periodLabel, balance }) {
  const totals = summary || {};
  const scope = periodLabel || 'Semua data';
  const cards = [
    {
      label: 'Saldo',
      sub: 'Semua rekening · saat ini',
      value: balance ?? totals.balance ?? 0,
      icon: Wallet,
      chip: 'from-indigo-500 to-violet-500',
      valueClass: 'text-slate-900 dark:text-white',
      accent: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
    },
    {
      label: 'Pemasukan',
      sub: `Uang masuk · ${scope}`,
      value: totals.income ?? 0,
      icon: TrendingUp,
      chip: 'from-emerald-500 to-teal-500',
      valueClass: 'text-emerald-600',
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    },
    {
      label: 'Pengeluaran',
      sub: `Uang keluar · ${scope}`,
      value: totals.expense ?? 0,
      icon: TrendingDown,
      chip: 'from-rose-500 to-orange-500',
      valueClass: 'text-rose-600',
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
    },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Ringkasan
        </h2>
        {periodLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm dark:border-slate-700 dark:text-slate-400">
            <Calendar className="h-3.5 w-3.5" /> {periodLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700/60 dark:bg-slate-800"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.chip}`} />
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${c.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-500">{c.label}</p>
                  <p
                    className={`truncate text-xl font-extrabold tracking-tight lg:text-2xl ${c.valueClass}`}
                    title={formatRupiah(c.value)}
                  >
                    {formatRupiahCompact(c.value)}
                  </p>
                  <p className="text-xs text-slate-400">{c.sub}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
