import { useState } from 'react';
import { Target } from 'lucide-react';
import { formatRupiah } from '../format';

export default function SavingsGoalCard({ balance, goal, onSave }) {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const target = Number(goal) || 0;
  const current = Number(balance) || 0;
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const remaining = target - current;
  const reached = target > 0 && current >= target;

  function toggleEdit() {
    if (!editing && target > 0) setValue(String(target));
    setEditing((e) => !e);
  }

  async function save(e) {
    e.preventDefault();
    const amount = Number(value);
    if (Number.isNaN(amount) || amount < 0) {
      setError('Target harus angka 0 atau lebih');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(amount);
      setValue('');
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan target');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <Target className="h-4 w-4 text-indigo-600" /> Target Tabungan
        </h2>
        <button
          onClick={toggleEdit}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {editing ? 'Batal' : target > 0 ? 'Ubah' : 'Atur target'}
        </button>
      </div>

      {editing ? (
        <>
          <form onSubmit={save} className="flex gap-2">
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="contoh: 10000000"
            autoFocus
            className="input"
          />
          <button type="submit" disabled={saving} className="btn btn-primary shrink-0 px-4 py-2">
            {saving ? '...' : 'Simpan'}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
            {error}
          </p>
        )}
        </>
      ) : target > 0 ? (
        <>
          <p className="text-sm text-slate-500">
            Terkumpul{' '}
            <span className="font-semibold text-slate-800">{formatRupiah(current)}</span> dari target{' '}
            {formatRupiah(target)}
          </p>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all ${
                reached ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className={`mt-2 text-sm ${reached ? 'font-medium text-emerald-600' : 'text-slate-500'}`}>
            {reached
              ? `🎉 Target tercapai! Kelebihan ${formatRupiah(Math.abs(remaining))}`
              : `Kurang ${formatRupiah(remaining)} lagi`}
          </p>
        </>
      ) : (
        <p className="py-2 text-sm text-slate-400">
          Belum ada target. Klik "Atur target" untuk mulai menabung.
        </p>
      )}
    </div>
  );
}
