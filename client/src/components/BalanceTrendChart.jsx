import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import ChartTooltip from './ChartTooltip';

export default function BalanceTrendChart({ data }) {
  const chartData = (data || []).map((d) => ({
    name: formatDate(d.date),
    Saldo: Number(d.balance),
  }));

  return (
    <div className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900 dark:text-white">
        <TrendingUp className="h-4 w-4 text-indigo-600" /> Tren Saldo
      </h2>
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Belum ada data. Tambahkan transaksi dulu.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="name"
                minTickGap={28}
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
              <Tooltip content={<ChartTooltip />} animationDuration={150} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="Saldo"
                stroke="#6366f1"
                strokeWidth={2.5}
                fill="url(#saldoGrad)"
                dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(day)} ${names[Number(m) - 1]} ${y}`;
}

function formatShort(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}rb`;
  return v;
}
