import { useState } from 'react';
import { Check, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatRupiah } from '../format';
import ConfirmDialog from './ConfirmDialog';

export default function DebtsCard({ debts = [], onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('lend');
  const [contact, setContact] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const active = debts.filter((d) => !d.settled);
  const totalLend = active
    .filter((d) => d.type === 'lend')
    .reduce((s, d) => s + Number(d.amount), 0);
  const totalBorrow = active
    .filter((d) => d.type === 'borrow')
    .reduce((s, d) => s + Number(d.amount), 0);

  function openAdd() {
    setEditingId(null);
    setName('');
    setAmount('');
    setType('lend');
    setContact('');
    setDueDate('');
    setNote('');
    setError('');
    setShowForm(true);
  }

  function openEdit(d) {
    setEditingId(d.id);
    setName(d.name);
    setAmount(String(d.amount));
    setType(d.type);
    setContact(d.contact || '');
    setDueDate(d.due_date || '');
    setNote(d.note || '');
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    const val = Number(amount);
    if (!name.trim()) {
      setError('Nama/pihak wajib diisi');
      return;
    }
    if (Number.isNaN(val) || val <= 0) {
      setError('Nominal harus lebih dari 0');
      return;
    }
    setBusy(true);
    try {
      const data = { name: name.trim(), amount: val, type, contact, dueDate, note };
      if (editingId != null) await onUpdate(editingId, data);
      else await onAdd(data);
      closeForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSettle(d) {
    setError('');
    try {
      await onUpdate(d.id, { settled: d.settled ? 0 : 1 });
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setError(err.message || 'Gagal menghapus catatan');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <HandCoins className="h-4 w-4 text-indigo-600" /> Hutang &amp; Piutang
        </h2>
        <button
          onClick={() => (showForm ? closeForm() : openAdd())}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {showForm ? (
            'Batal'
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Tambah
            </>
          )}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      {showForm && (
        <form onSubmit={submit} className="mb-4 space-y-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-700">
            <button
              type="button"
              onClick={() => setType('lend')}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                type === 'lend'
                  ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Piutang (dipinjamkan)
            </button>
            <button
              type="button"
              onClick={() => setType('borrow')}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                type === 'borrow'
                  ? 'bg-white text-rose-600 shadow-sm dark:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Utang (pinjaman)
            </button>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama orang / pihak"
            className="input"
          />
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Nominal"
            className="input"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input"
              title="Jatuh tempo (opsional)"
            />
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Kontak (opsional)"
              className="input"
            />
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan (opsional)"
            className="input"
          />
          <button type="submit" disabled={busy} className="btn btn-primary w-full py-2">
            {busy ? '...' : editingId != null ? 'Perbarui' : 'Simpan'}
          </button>
        </form>
      )}

      {(totalLend > 0 || totalBorrow > 0) && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
          {totalLend > 0 && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              Piutang {formatRupiah(totalLend)}
            </span>
          )}
          {totalBorrow > 0 && (
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              Utang {formatRupiah(totalBorrow)}
            </span>
          )}
        </div>
      )}

      {debts.length === 0 && !showForm ? (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-400">
          Belum ada catatan hutang-piutang. Klik &quot;Tambah&quot;.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {debts.map((d) => {
            const isLend = d.type === 'lend';
            return (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p
                    className={`truncate font-medium text-slate-700 dark:text-slate-200 ${
                      d.settled ? 'line-through opacity-60' : ''
                    }`}
                  >
                    {d.name}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {isLend ? 'Dipinjamkan' : 'Utang'}
                    {d.due_date
                      ? ` · jatuh tempo ${new Date(d.due_date).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}`
                      : ''}
                    {d.note ? ` · ${d.note}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`text-sm font-semibold ${
                      isLend ? 'text-emerald-600' : 'text-rose-600'
                    } ${d.settled ? 'opacity-50' : ''}`}
                  >
                    {formatRupiah(d.amount)}
                  </span>
                  <button
                    onClick={() => toggleSettle(d)}
                    className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                      d.settled
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15'
                        : 'text-slate-300 hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-500/15'
                    }`}
                    title={d.settled ? 'Batalkan lunas' : 'Tandai lunas'}
                    aria-label={d.settled ? `Batalkan lunas ${d.name}` : `Tandai lunas ${d.name}`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openEdit(d)}
                    className="text-slate-400 transition-colors hover:text-indigo-600"
                    title="Edit"
                    aria-label={`Edit ${d.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setError('');
                      setPendingDelete(d);
                    }}
                    className="text-slate-400 transition-colors hover:text-rose-600"
                    title="Hapus"
                    aria-label={`Hapus ${d.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus catatan?"
        message={`"${pendingDelete?.name || ''}" sebesar ${formatRupiah(
          pendingDelete?.amount ?? 0
        )} akan dihapus permanen.`}
        error={error}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}
