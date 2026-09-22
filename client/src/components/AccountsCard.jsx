import { useState } from 'react';
import { ArrowLeftRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatRupiah, todayLocal } from '../format';
import { ACCOUNT_PRESETS, getAccountColor, getAccountIcon } from '../accountIcons';
import ConfirmDialog from './ConfirmDialog';

export default function AccountsCard({
  accounts,
  transfers = [],
  onAdd,
  onDelete,
  onTransfer,
  onUpdateTransfer,
  onDeleteTransfer,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [kind, setKind] = useState('bank');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => todayLocal());
  const [editingId, setEditingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const total = accounts.reduce((s, a) => s + Number(a.balance), 0);

  const accountName = (id) => accounts.find((a) => String(a.id) === String(id))?.name || '?';

  function toggleTransfer() {
    if (accounts.length < 2) {
      setError('Butuh minimal 2 rekening untuk transfer');
      return;
    }
    setError('');
    if (showTransfer) {
      resetTransferForm();
    } else {
      setShowTransfer(true);
    }
    setShowAdd(false);
  }

  function resetTransferForm() {
    setShowTransfer(false);
    setEditingId(null);
    setFromId('');
    setToId('');
    setAmount('');
    setNote('');
    setDate(todayLocal());
  }

  function openEditTransfer(t) {
    if (accounts.length < 2) {
      setError('Butuh minimal 2 rekening untuk transfer');
      return;
    }
    setError('');
    setShowAdd(false);
    setShowTransfer(true);
    setEditingId(t.id);
    setFromId(String(t.from_account_id));
    setToId(String(t.to_account_id));
    setAmount(String(t.amount));
    setNote(t.note || '');
    setDate(t.date);
  }

  async function confirmDeleteTransfer() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteTransfer(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err.message || 'Gagal menghapus transfer');
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteAccount() {
    if (!pendingDeleteAccount) return;
    setDeletingAccount(true);
    setDeleteAccountError('');
    try {
      await onDelete(pendingDeleteAccount.id);
      setPendingDeleteAccount(null);
    } catch (err) {
      setDeleteAccountError(err.message || 'Gagal menghapus rekening');
    } finally {
      setDeletingAccount(false);
    }
  }

  async function submitAdd(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama rekening wajib diisi');
      return;
    }
    setBusy(true);
    try {
      await onAdd(name.trim(), Number(initial) || 0, kind);
      setName('');
      setInitial('');
      setKind('bank');
      setShowAdd(false);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer(e) {
    e.preventDefault();
    const val = Number(amount);
    if (!fromId || !toId) {
      setError('Pilih rekening asal & tujuan');
      return;
    }
    if (fromId === toId) {
      setError('Asal dan tujuan tidak boleh sama');
      return;
    }
    if (Number.isNaN(val) || val <= 0) {
      setError('Nominal harus lebih dari 0');
      return;
    }
    setBusy(true);
    try {
      const data = {
        fromId: Number(fromId),
        toId: Number(toId),
        amount: val,
        note,
        date,
      };
      if (editingId != null) {
        await onUpdateTransfer(editingId, data);
      } else {
        await onTransfer(data);
      }
      resetTransferForm();
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold dark:text-slate-100">Rekening</h2>
        <div className="flex gap-2">
          <button
            onClick={toggleTransfer}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {showTransfer ? 'Tutup' : 'Transfer'}
          </button>
          <button
            onClick={() => {
              setShowAdd((s) => !s);
              setShowTransfer(false);
              setError('');
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            {showAdd ? 'Tutup' : 'Rekening'}
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={submitAdd} className="mb-3 space-y-2 rounded-xl bg-slate-50 p-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Pilih cepat:</p>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_PRESETS.map((p) => {
                const PresetIcon = getAccountIcon(p.name);
                const active = name === p.name;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setName(p.name);
                      setKind(p.kind);
                      setError('');
                    }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <PresetIcon
                      className="h-3.5 w-3.5"
                      style={{ color: getAccountColor(p.name) }}
                    />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama rekening (mis. BCA)"
            className="input"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              placeholder="Saldo awal (opsional)"
              className="input"
            />
            <button type="submit" disabled={busy} className="btn btn-primary shrink-0 px-4">
              {busy ? '...' : 'Simpan'}
            </button>
          </div>
        </form>
      )}

      {showTransfer && (
        <form onSubmit={submitTransfer} className="mb-3 space-y-2 rounded-xl bg-slate-50 p-3">
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="input"
          >
            <option value="">Dari rekening</option>
            {accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className="input"
          >
            <option value="">Ke rekening</option>
            {accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Nominal"
            className="input"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan (opsional)"
            className="input"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary flex-1 py-2"
            >
              {busy ? '...' : editingId != null ? 'Perbarui' : 'Transfer'}
            </button>
            {editingId != null && (
              <button
                type="button"
                onClick={resetTransferForm}
                className="btn btn-secondary px-4 py-2"
              >
                Batal
              </button>
            )}
          </div>
        </form>
      )}

      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}

      {accounts.length === 0 ? (
        <p className="py-3 text-sm text-slate-400">Belum ada rekening. Tambahkan dulu.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {accounts.map((a) => {
              const AccountIcon = getAccountIcon(a.name, a.kind);
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                      style={{ backgroundColor: getAccountColor(a.name, a.kind) }}
                    >
                      <AccountIcon className="h-4 w-4" />
                    </span>
                    <span className="truncate font-medium text-slate-700">{a.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`font-semibold ${
                        Number(a.balance) < 0 ? 'text-rose-600' : 'text-slate-800'
                      }`}
                    >
                      {formatRupiah(a.balance)}
                    </span>
                    <button
                      onClick={() => {
                        setDeleteAccountError('');
                        setPendingDeleteAccount(a);
                      }}
                      className="text-slate-400 transition-colors hover:text-rose-600"
                      title="Hapus"
                      aria-label={`Hapus rekening ${a.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-right text-sm text-slate-500">
            Total:{' '}
            <span className="font-semibold text-slate-800">{formatRupiah(total)}</span>
          </p>
        </>
      )}

      {transfers.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Riwayat Transfer
          </h3>
          <ul className="space-y-2">
            {transfers.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-slate-700">
                    {accountName(t.from_account_id)} → {accountName(t.to_account_id)}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {formatRupiah(t.amount)}
                    {t.note ? ` · ${t.note}` : ''}
                    {' · '}
                    {new Date(t.date).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => openEditTransfer(t)}
                    className="text-slate-400 transition-colors hover:text-indigo-600"
                    title="Edit transfer"
                    aria-label={`Edit transfer ${accountName(t.from_account_id)} ke ${accountName(t.to_account_id)}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setDeleteError('');
                      setPendingDelete(t);
                    }}
                    className="text-slate-400 transition-colors hover:text-rose-600"
                    title="Hapus transfer"
                    aria-label={`Hapus transfer ${accountName(t.from_account_id)} ke ${accountName(t.to_account_id)}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDeleteAccount}
        title="Hapus rekening?"
        message={`Rekening "${pendingDeleteAccount?.name ?? ''}" akan dipindah ke recycle bin (bisa dipulihkan 30 hari). Transaksi tetap tersimpan.`}
        error={deleteAccountError}
        onCancel={() => {
          setPendingDeleteAccount(null);
          setDeleteAccountError('');
        }}
        onConfirm={confirmDeleteAccount}
        loading={deletingAccount}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus transfer?"
        message={`Transfer ${formatRupiah(pendingDelete?.amount ?? 0)} dari ${accountName(
          pendingDelete?.from_account_id
        )} ke ${accountName(pendingDelete?.to_account_id)} akan dipindah ke recycle bin (bisa dipulihkan 30 hari).`}
        error={deleteError}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError('');
        }}
        onConfirm={confirmDeleteTransfer}
        loading={deleting}
      />
    </div>
  );
}
