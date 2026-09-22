import { formatRupiah } from '../format';

export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="min-w-[150px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
      {label != null && (
        <p className="mb-1.5 font-semibold text-slate-700">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 py-0.5 text-slate-600">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: p.color || p.payload?.fill || '#6366f1' }}
          />
          <span>{p.name}:</span>
          <span className="ml-auto font-semibold text-slate-800">
            {formatRupiah(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
}
