import { useState } from 'react';
import { PiggyBank } from 'lucide-react';
import { formatRupiah } from '../format';

export default function BudgetCard({ monthExpense, budget, onSave }) {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const spent = Number(monthExpense) || 0;
  const limit = Number(budget) || 0;
  const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
  const over = limit > 0 && spent > limit;
  const remaining = limit - spent;

  function toggleEdit() {
    if (!editing && limit > 0) setValue(String(limit));
    setEditing((e) => !e);
  }

  async function save(e) {
    e.preventDefault();
    const amount = Number(value);
    if (Number.isNaN(amount) || amount < 0) {
      setError('Anggaran harus angka 0 atau lebih');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(amount);
      setValue('');
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan anggaran');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <PiggyBank className="h-4 w-4 text-indigo-600" /> Anggaran Bulanan
        </h2>
        <button
          onClick={toggleEdit}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {editing ? 'Batal' : limit > 0 ? 'Ubah' : 'Atur anggaran'}
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
            placeholder="contoh: 2000000"
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
      ) : limit > 0 ? (
        <>
          <p className="text-sm text-slate-500">
            Terpakai{' '}
            <span className="font-semibold text-slate-800">{formatRupiah(spent)}</span> dari{' '}
            {formatRupiah(limit)}
          </p>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all ${
                over ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p
            className={`mt-2 text-sm ${
              over ? 'font-medium text-rose-600' : 'text-slate-500'
            }`}
          >
            {over
              ? `Melebihi anggaran ${formatRupiah(Math.abs(remaining))}`
              : `Sisa ${formatRupiah(remaining)}`}
          </p>
        </>
      ) : (
        <p className="py-2 text-sm text-slate-400">
          Belum ada anggaran. Klik "Atur anggaran" untuk mulai.
        </p>
      )}
    </div>
  );
}
