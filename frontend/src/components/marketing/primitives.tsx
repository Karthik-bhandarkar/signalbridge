"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Section/content reveal: opacity + 16px rise, once, respects reduced motion. Content exists in the DOM either way. */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`reveal ${className ?? ""}`}
      style={style}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function ScrollProgress() {
  return <ProgressBar />;
}

function ProgressBar() {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScale(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return <div className="lp-progress" style={{ transform: `scaleX(${scale})` }} aria-hidden="true" />;
}

/** Counts up to a real, server-supplied value once visible. Renders the final value immediately with JS disabled. */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1200,
  label,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  label?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView || reduce) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      setDisplay(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [inView, value, duration, reduce]);

  const formatted = display.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span ref={ref} aria-label={label ?? `${prefix}${value}${suffix}`}>
      <span aria-hidden="true">{prefix}{formatted}{suffix}</span>
    </span>
  );
}

/** Aligns actions without cursor-following motion. Button hover feedback is handled in CSS. */
export function Magnetic({ children }: { children: ReactNode }) {
  return <span style={{ display: "inline-flex" }}>{children}</span>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.dispatchEvent(new CustomEvent("sb:toast", { detail: { message: "Copied to clipboard" } }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1900);
  }

  return (
    <>
      <button type="button" className="copy-btn" data-copied={copied} onClick={copy} aria-label={copied ? "Copied" : label}>
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span key="check" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} style={{ display: "inline-flex" }} transition={{ duration: 0.18 }}>
              <Check size={11} aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span key="copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "inline-flex" }} transition={{ duration: 0.18 }}>
              <Copy size={11} aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{copied ? "Copied to clipboard" : ""}</span>
    </>
  );
}

/** One toast at a time; rapid copies replace rather than stack. */
export function ToastHost() {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setToast({ id: Date.now(), message: detail?.message ?? "Copied to clipboard" });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 1900);
    };
    window.addEventListener("sb:toast", onToast);
    return () => {
      window.removeEventListener("sb:toast", onToast);
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <div aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div key={toast.id} className="toast" role="status" initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
            <Check size={14} style={{ color: "var(--success)" }} aria-hidden="true" />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { EASE };
