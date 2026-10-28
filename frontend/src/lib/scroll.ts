"use client";

import { useEffect, useRef, useState } from "react";

/** Shared, render-free scroll state read by the WebGL frame loop. */
export const scrollState = {
  progress: 0,
  velocity: 0,
  pointerX: 0,
  pointerY: 0,
  ready: false,
};

let markReady: (() => void) | null = null;

/** Resolves when the preloader curtain has lifted, so hero reveals are not wasted. */
export const appReady =
  typeof window === "undefined"
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        markReady = resolve;
        window.setTimeout(resolve, 4000);
      });

export function signalAppReady() {
  markReady?.();
}

export function useRevealOnce<T extends HTMLElement = HTMLDivElement>(delay = 0) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.classList.add("is-in");
      return;
    }
    node.classList.add("will-reveal");
    let timer: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            timer = window.setTimeout(() => node.classList.add("is-in"), delay);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      node.classList.remove("will-reveal");
    };
  }, [delay]);
  return ref;
}

/** Local progress (0→1) of an element across the viewport, sampled on rAF. */
export function useSectionProgress<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    let last = -1;
    const tick = () => {
      const node = ref.current;
      if (node) {
        const rect = node.getBoundingClientRect();
        const total = rect.height - window.innerHeight;
        const value = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
        if (Math.abs(value - last) > 0.002) {
          last = value;
          setProgress(value);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return { ref, progress };
}

export function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}
