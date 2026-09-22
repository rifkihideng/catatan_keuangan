import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import ChartTooltip from './ChartTooltip';

export default function MonthlyChart({ data }) {
  const chartData = data.map((d) => ({
    name: formatMonth(d.month),
    Pemasukan: d.income,
    Pengeluaran: d.expense,
  }));

  return (
    <div className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
        <BarChart3 className="h-4 w-4 text-indigo-600" /> Grafik Bulanan
      </h2>
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Belum ada data. Tambahkan transaksi dulu.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
              <defs>
                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb7185" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
              />
              <YAxis
                tickFormatter={formatShort}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                width={48}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
              <Bar dataKey="Pemasukan" fill="url(#gradIncome)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              <Bar dataKey="Pengeluaran" fill="url(#gradExpense)" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center justify-center gap-5 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Pemasukan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Pengeluaran
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMonth(m) {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${names[Number(mo) - 1]} ${y}`;
}

function formatShort(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}rb`;
  return v;
}
