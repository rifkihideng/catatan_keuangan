import { useEffect, useId, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  History,
  Repeat,
  RotateCcw,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { deleteTrashItem, emptyTrash, getTrash, restoreTrashItem } from '../api';
import { formatRupiah } from '../format';
import { useModalA11y } from '../useModalA11y';
import ConfirmDialog from './ConfirmDialog';

const ENTITY_LABEL = {
  transaction: 'Transaksi',
  recurring: 'Berulang',
  transfer: 'Transfer',
  account: 'Rekening',
};

const FREQ_LABEL = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' };
const KIND_LABEL = { cash: 'Tunai', bank: 'Bank', ewallet: 'E-Wallet' };

function itemMeta(t) {
  switch (t.entity) {
    case 'transaction':
    case 'recurring':
      return {
        Icon: t.type === 'income' ? ArrowUp : ArrowDown,
        iconClass:
          t.type === 'income'
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-rose-100 text-rose-600',
        title: t.category || 'Tanpa kategori',
        subtitle:
          t.entity === 'recurring'
            ? `${FREQ_LABEL[t.frequency] || 'Bulanan'} · berikutnya ${formatDate(t.date)}`
            : `${formatDate(t.date)}${t.account_name ? ` · ${t.account_name}` : ''}`,
        amount: `${t.type === 'income' ? '+' : '−'}${formatRupiah(t.amount)}`,
        amountClass: t.type === 'income' ? 'text-emerald-600' : 'text-rose-600',
      };
    case 'transfer':
      return {
        Icon: ArrowLeftRight,
        iconClass: 'bg-sky-100 text-sky-600',
        title: `${t.from_name || '?'} → ${t.to_name || '?'}`,
        subtitle: `${formatDate(t.date)}${t.description ? ` · ${t.description}` : ''}`,
        amount: formatRupiah(t.amount),
        amountClass: 'text-slate-600 dark:text-slate-300',
      };
    case 'account':
      return {
        Icon: Wallet,
        iconClass: 'bg-indigo-100 text-indigo-600',
        title: t.name || 'Rekening',
        subtitle: KIND_LABEL[t.kind] || 'Rekening',
        amount: formatRupiah(t.initial_balance || 0),
        amountClass: 'text-slate-600 dark:text-slate-300',
      };
    default:
      return {
        Icon: History,
        iconClass: 'bg-slate-100 text-slate-500',
        title: 'Item',
        subtitle: '',
        amount: '',
        amountClass: '',
      };
  }
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function TrashDialog({ open, onClose, onChanged }) {
  const titleId = useId();
  const panelRef = useModalA11y(open, onClose);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await getTrash());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function handleRestore(item) {
    setBusy(true);
    try {
      await restoreTrashItem(item.entity, item.id);
      await onChanged?.();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePermanently() {
    if (!pending) return;
    setBusy(true);
    try {
      await deleteTrashItem(pending.entity, pending.id);
      setPending(null);
      await onChanged?.();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEmpty() {
    setBusy(true);
    try {
      await emptyTrash();
      setConfirmEmpty(false);
      await onChanged?.();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[85vh] w-full max-w-lg animate-dialog-in flex-col rounded-xl bg-white shadow-xl outline-none dark:bg-slate-800"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-indigo-600" />
            <h3 id={titleId} className="font-semibold text-slate-800 dark:text-slate-100">
              Recycle Bin
            </h3>
            {!loading && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                {items.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmEmpty(true)}
              disabled={loading || items.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Kosongkan
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              title="Tutup"
              aria-label="Tutup recycle bin"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs text-slate-400">
            Transaksi yang dihapus bisa dipulihkan dalam 30 hari. Setelah itu akan dihapus permanen
            otomatis.
          </p>
          {error && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </p>
          )}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
              <p className="text-sm">Memuat...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-slate-400 dark:bg-slate-700">
                <History className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-300">
                Recycle bin kosong
              </p>
              <p className="text-xs text-slate-400">Tidak ada transaksi yang dihapus.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((t, i) => {
                const meta = itemMeta(t);
                const Icon = meta.Icon;
                return (
                  <li
                    key={`${t.entity}-${t.id}`}
                    className="flex animate-list-in items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-700"
                    style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.iconClass}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                            {meta.title}
                          </p>
                          <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-700 dark:text-slate-300">
                            {ENTITY_LABEL[t.entity] || t.entity}
                          </span>
                        </div>
                        <p className="truncate text-xs text-slate-400">{meta.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`text-sm font-semibold ${meta.amountClass}`}>
                        {meta.amount}
                      </span>
                      <button
                        onClick={() => handleRestore(t)}
                        disabled={busy}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-slate-700"
                        title="Pulihkan"
                        aria-label={`Pulihkan ${meta.title}`}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPending(t)}
                        disabled={busy}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-slate-700"
                        title="Hapus permanen"
                        aria-label={`Hapus permanen ${meta.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pending}
        title="Hapus permanen?"
        message={`"${pending ? itemMeta(pending).title : ''}" akan dihapus permanen dan tidak bisa dipulihkan.`}
        onCancel={() => setPending(null)}
        onConfirm={handleDeletePermanently}
        loading={busy}
      />
      <ConfirmDialog
        open={confirmEmpty}
        title="Kosongkan recycle bin?"
        message="Semua transaksi terhapus akan dihapus permanen dan tidak bisa dipulihkan."
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={handleEmpty}
        loading={busy}
      />
    </div>
  );
}
