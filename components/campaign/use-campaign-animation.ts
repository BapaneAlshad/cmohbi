"use client";

import { useEffect, useRef, useState } from "react";

/** Reveal each Campaign visual once, when it enters its scroll viewport. */
export function useCampaignReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const syncPreference = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) { setRevealed(true); observer?.disconnect(); }
    };
    syncPreference();
    preference.addEventListener("change", syncPreference);
    if (!preference.matches && ref.current && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer?.disconnect();
        }
      });
      observer.observe(ref.current);
    } else setRevealed(true);
    return () => { observer?.disconnect(); preference.removeEventListener("change", syncPreference); };
  }, []);

  return { ref, revealed, reducedMotion };
}

/** One animation clock keeps numeric percentages and every phase fill in sync. */
export function useAnimatedCampaignValues(targets: number[], revealed: boolean, reducedMotion: boolean) {
  const [values, setValues] = useState(() => targets.map(() => 0));
  const current = useRef(values);
  const targetKey = JSON.stringify(targets);

  useEffect(() => {
    if (!revealed) return;
    const end: number[] = JSON.parse(targetKey);
    if (reducedMotion) {
      current.current = end;
      setValues(end);
      return;
    }
    const start = end.map((_, index) => current.current[index] ?? 0);
    if (end.every((value, index) => value === start[index])) return;
    let frame = 0;
    let startedAt: number | undefined;
    const tick = (now: number) => {
      startedAt ??= now;
      const time = Math.min((now - startedAt) / 720, 1);
      const eased = 1 - (1 - time) ** 3;
      const next = end.map((value, index) => time === 1 ? value : start[index] + (value - start[index]) * eased);
      current.current = next;
      setValues(next);
      if (time < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targetKey, revealed, reducedMotion]);

  return reducedMotion ? targets : targets.map((_, index) => values[index] ?? 0);
}
