import { BarChart3 } from 'lucide-react';
import { formatRupiahCompact } from '../format';

export default function CategoryReport({ data = [] }) {
  const rows = Array.isArray(data) ? data : [];

  const months = [...new Set(rows.map((r) => r.month))].sort();
  const categories = [...new Set(rows.map((r) => r.category))].sort((a, b) =>
    a.localeCompare(b, 'id')
  );

  const matrix = {};
  const categoryTotals = {};
  const monthTotals = {};
  for (const r of rows) {
    matrix[r.category] = matrix[r.category] || {};
    matrix[r.category][r.month] = Number(r.total) || 0;
    categoryTotals[r.category] = (categoryTotals[r.category] || 0) + (Number(r.total) || 0);
    monthTotals[r.month] = (monthTotals[r.month] || 0) + (Number(r.total) || 0);
  }
  const grandTotal = Object.values(monthTotals).reduce((s, v) => s + v, 0);

  const header = (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
        <BarChart3 className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Laporan Pengeluaran per Kategori
        </h2>
        <p className="text-xs text-slate-400">Pengeluaran per kategori dari waktu ke waktu</p>
      </div>
    </div>
  );

  if (months.length === 0) {
    return (
      <div className="card p-5">
        {header}
        <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-400">
          <BarChart3 className="h-8 w-8" />
          <p className="text-sm">Belum ada data pengeluaran</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {header}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Kategori
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  {monthShort(m)}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr
                key={c}
                className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/40"
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200">
                  {c}
                </td>
                {months.map((m) => (
                  <td
                    key={m}
                    className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-300"
                  >
                    {matrix[c]?.[m] ? formatRupiahCompact(matrix[c][m]) : '—'}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                  {formatRupiahCompact(categoryTotals[c] || 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-700/40">
              <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                Total
              </td>
              {months.map((m) => (
                <td
                  key={m}
                  className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100"
                >
                  {formatRupiahCompact(monthTotals[m] || 0)}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                {formatRupiahCompact(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
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
