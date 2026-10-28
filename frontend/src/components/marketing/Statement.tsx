"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";
import { BridgeGlyph } from "./Logo";
import { Reveal } from "./primitives";

/** Answers "what problem does it solve", stated plainly — this is the problem section. */
const COPY: { text: string; hot?: boolean }[] = [
  { text: "Alerts are not the problem." },
  { text: "Noise is." },
  { text: "One failure becomes forty pages, and the one that matters arrives somewhere in the middle." },
  { text: "SignalBridge", hot: true },
  { text: "absorbs the repeats, groups what belongs together, and hands your team" },
  { text: "one incident", hot: true },
  { text: "with an owner and a history." },
];

function Word({ word, progress, range }: { word: { text: string; hot?: boolean }; progress: MotionValue<number>; range: [number, number] }) {
  const reduce = useReducedMotion();
  const opacity = useTransform(progress, range, reduce ? [1, 1] : [0.2, 1]);
  return (
    <motion.span className={`sw${word.hot ? " is-hot" : ""}`} style={{ opacity }}>
      {word.text}
    </motion.span>
  );
}

export default function Statement() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.82", "end 0.55"] });

  return (
    <section className="lp-section statement" aria-labelledby="statement-title">
      <div className="lp-wrap">
        <div className="st-grid">
          <div>
            <Reveal>
              <span className="lp-eyebrow">The problem</span>
              <h2 id="statement-title" className="lp-h2 st-title">What we think</h2>
            </Reveal>
            <div ref={ref}>
              <p className="statement-text">
                {COPY.map((word, index) => {
                  const start = index / COPY.length;
                  const end = Math.min(1, start + 1.6 / COPY.length);
                  return <Word key={`${word.text}-${index}`} word={word} progress={scrollYProgress} range={[start, end]} />;
                })}
              </p>
            </div>
          </div>

          <Reveal delay={0.1}>
            <div className="st-frame" aria-label="One incident, not fifty">
              <span className="st-frame-glyph" aria-hidden="true"><BridgeGlyph size={64} /></span>
              <div className="st-frame-text" aria-hidden="true">
                <span>One</span>
                <span>incident</span>
                <span>not</span>
                <span>fifty</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
