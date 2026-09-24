import { useEffect, useRef, useState } from 'react';

/**
 * Angka yang "menghitung" dari nilai lama ke nilai baru dengan easing halus.
 * Menghormati prefers-reduced-motion (langsung lompat ke nilai akhir).
 */
export default function AnimatedNumber({ value, format = (n) => String(n), className, title }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = Number(value) || 0;
    prevRef.current = to;

    if (from === to) {
      setDisplay(to);
      return undefined;
    }

    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(to);
      return undefined;
    }

    const duration = 700;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return (
    <span className={className} title={title}>
      {format(display)}
    </span>
  );
}
