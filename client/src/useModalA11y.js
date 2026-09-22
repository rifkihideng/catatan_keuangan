import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Aksesibilitas dialog: tutup dengan Escape, kunci fokus (focus trap),
 * fokuskan elemen pertama saat dibuka, dan kembalikan fokus saat ditutup.
 * Pasang ref yang dikembalikan ke elemen panel dialog.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{ capture?: boolean }} [options] `capture: true` untuk dialog bertingkat
 *   (mis. konfirmasi di dalam dialog lain) agar Escape tidak menutup dialog induknya.
 */
export function useModalA11y(open, onClose, { capture = false } = {}) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);

  // Simpan callback terbaru tanpa memicu ulang effect (menghindari fokus "melompat").
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const node = ref.current;
    const previouslyFocused = document.activeElement;

    const focusable = () =>
      Array.from(node?.querySelectorAll(FOCUSABLE) || []).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );

    const first = focusable()[0];
    (first || node)?.focus?.();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (capture) e.stopPropagation();
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === node)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, capture);
    return () => {
      document.removeEventListener('keydown', onKeyDown, capture);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus?.();
    };
  }, [open, capture]);

  return ref;
}
