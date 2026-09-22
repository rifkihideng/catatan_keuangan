import { useId } from 'react';
import { useModalA11y } from '../useModalA11y';

export default function ConfirmDialog({ open, title, message, error, onCancel, onConfirm, loading }) {
  const titleId = useId();
  // capture: true → Escape hanya menutup konfirmasi ini, bukan dialog induknya
  const panelRef = useModalA11y(open, onCancel, { capture: true });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onCancel} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-sm animate-dialog-in rounded-xl bg-white p-5 shadow-xl outline-none"
      >
        <h3 id={titleId} className="font-semibold text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{message}</p>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
          >
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
          >
            {loading ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}
