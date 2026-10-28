"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Landing-only smooth scrolling.
 * Native scrolling remains the fallback for reduced motion and coarse pointers.
 * Publishes scroll progress/velocity to the page root for the premium background.
 */
export default function SmoothScroll() {
  const reduce = useReducedMotion();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root || reduce || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    root.dataset.scrollMode = coarse ? "native-touch" : "smooth";

    const updateVars = (scroll = window.scrollY) => {
      const limit = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, scroll / limit));
      root.style.setProperty("--scroll-progress", progress.toFixed(5));
      root.style.setProperty("--scroll-y", `${Math.round(scroll)}px`);
    };

    updateVars();

    if (coarse) {
      const onScroll = () => updateVars();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    const lenis = new Lenis({
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 0.92,
      anchors: { offset: -84 } as never,
      respectReducedMotion: true,
      prevent: (node: HTMLElement) => Boolean(node.closest("[data-lenis-prevent], dialog, .ops-scroll, .cmdk-list")),
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    const onScroll = (event: { scroll: number; velocity: number }) => {
      updateVars(event.scroll);
      const velocity = Math.max(-1, Math.min(1, event.velocity / 18));
      root.style.setProperty("--scroll-velocity", velocity.toFixed(4));
    };
    lenis.on("scroll", onScroll);

    return () => {
      window.cancelAnimationFrame(raf);
      lenis.destroy();
      root.style.setProperty("--scroll-velocity", "0");
    };
  }, [reduce]);

  return null;
}
