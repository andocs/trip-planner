"use client";

import { useEffect, useRef, useState } from "react";

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A number that counts to its new value instead of jumping (about 0.45 s, easing out). It shows the real value on first
 * render (so server HTML and the first browser render match, and nothing animates on load), and with reduced motion it
 * simply changes. Pair it with text a screen reader can use: the digits are only what is on screen.
 */
export function AnimatedNumber({ value, format = whole }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : 450;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const next = k >= 1 ? value : start + (value - start) * eased;
      current.current = next;
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{format(shown)}</>;
}
