import { BarChart3, CalendarDays, Trophy } from 'lucide-react';
import { formatRupiah, formatRupiahCompact } from '../format';

export default function StatsCard({ stats }) {
  const s = stats || {};
  const avg = Number(s.avgDailyExpense) || 0;
  const largest = s.largestTransaction;
  const trend = s.trend || { current: 0, last: 0 };
  const diff = trend.current - trend.last;
  const pct = trend.last > 0 ? Math.round((diff / trend.last) * 100) : trend.current > 0 ? 100 : 0;
  const up = diff > 0;

  const items = [
    {
      label: 'Rata-rata Pengeluaran Harian',
      icon: CalendarDays,
      chip: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
      content: (
        <>
          <p className="mt-0.5 truncate text-xl font-bold text-slate-800 lg:text-2xl" title={formatRupiah(avg)}>
            {formatRupiahCompact(avg)}
          </p>
          <p className="text-xs text-slate-400">
            {s.daysElapsed ? `dari ${s.daysElapsed} hari berjalan` : 'bulan ini'}
          </p>
        </>
      ),
    },
    {
      label: 'Transaksi Terbesar',
      icon: Trophy,
      chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
      content: largest ? (
        <>
          <p className="mt-0.5 truncate text-xl font-bold text-slate-800 lg:text-2xl" title={formatRupiah(largest.amount)}>
            {formatRupiahCompact(largest.amount)}
          </p>
          <p className="text-xs text-slate-400">
            {largest.category || 'Tanpa kategori'}
            {largest.date
              ? ` · ${new Date(largest.date).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                })}`
              : ''}
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-2xl font-bold text-slate-300">—</p>
      ),
    },
    {
      label: 'Bulan Ini vs Bulan Lalu',
      icon: BarChart3,
      chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
      content: (
        <>
          <p className="mt-0.5 truncate text-xl font-bold text-slate-800 lg:text-2xl" title={formatRupiah(trend.current)}>
            {formatRupiahCompact(trend.current)}
          </p>
          <p className="text-xs text-slate-400">
            {trend.last > 0 ? (
              <>
                bulan lalu {formatRupiahCompact(trend.last)} ·{' '}
                <span className={up ? 'font-medium text-rose-600' : 'font-medium text-emerald-600'}>
                  {up ? '↑' : '↓'} {Math.abs(pct)}%
                </span>
              </>
            ) : (
              'tidak ada data bulan lalu'
            )}
          </p>
        </>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="card p-5 transition-shadow duration-300 ease-smooth hover:shadow-md">
            <div className="flex items-start gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${it.chip}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">{it.label}</p>
                {it.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
