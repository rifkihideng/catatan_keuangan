import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { formatRupiah } from '../format';
import ChartTooltip from './ChartTooltip';

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6',
  '#14b8a6', '#f97316', '#84cc16', '#ec4899', '#64748b', '#22c55e',
];

export default function CategoryChart({ transactions }) {
  const [type, setType] = useState('expense');

  const grouped = transactions
    .filter((t) => t.type === type)
    .reduce((acc, t) => {
      const key = t.category || 'Tanpa kategori';
      acc[key] = acc[key] || { name: key, value: 0 };
      acc[key].value += Number(t.amount);
      return acc;
    }, {});

  const data = Object.values(grouped).sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <PieChartIcon className="h-4 w-4 text-indigo-600" /> Rincian per Kategori
        </h2>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              type === 'expense' ? 'bg-white text-rose-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Pengeluaran
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              type === 'income' ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Pemasukan
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Belum ada data {type === 'expense' ? 'pengeluaran' : 'pemasukan'}.
        </p>
      ) : (
        <>
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total</p>
              <p className="text-lg font-bold text-slate-800">{formatRupiah(total)}</p>
            </div>
          </div>

          <ul className="mt-4 space-y-2.5">
            {data.map((d, i) => {
              const color = COLORS[i % COLORS.length];
              const pct = total ? Math.round((d.value / total) * 100) : 0;
              return (
                <li key={d.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="w-24 shrink-0 truncate text-slate-600" title={d.name}>
                    {d.name}
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right font-semibold text-slate-700">
                    {formatRupiah(d.value)}
                  </span>
                  <span className="w-9 shrink-0 text-right text-xs font-medium text-slate-400">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
