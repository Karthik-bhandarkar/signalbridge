"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Hand, RotateCcw, Zap } from "lucide-react";
import { Reveal } from "./primitives";

const NODES = [
  { tone: "coral", icon: Zap, title: "Triggered", time: "14:02:11", body: "A checkout API alert arrives and opens an incident in the demo workspace." },
  { tone: "amber", icon: Hand, title: "Acknowledged", time: "14:04:38", body: "An operator acknowledges the incident and becomes its assignee." },
  { tone: "mint", icon: Check, title: "Resolved", time: "14:21:09", body: "The operator resolves the incident; the action is added to its timeline." },
  { tone: "sky", icon: RotateCcw, title: "Manually reopened", time: "14:33:52", body: "An operator can reopen the resolved incident and retain its history." },
] as const;

export default function Lifecycle() {
  const reduced = useReducedMotion();
  return (
    <section id="reliability" className="lp-section" aria-labelledby="reliability-title">
      <div className="lp-wrap">
        <div className="lp-head">
          <Reveal className="lp-head-copy">
            <span className="lp-eyebrow">Incident lifecycle</span>
            <h2 id="reliability-title" className="lp-h2">An incident has a memory.</h2>
          </Reveal>
          <Reveal className="lp-head-aside" delay={0.08}>
            <p className="lp-body" style={{ margin: 0 }}>
              Operators can acknowledge, resolve and manually reopen an incident. Each action is recorded alongside the signals.
            </p>
          </Reveal>
        </div>
        <Reveal>
          <div className="lc-track">
            <div className="lc-rail" aria-hidden="true">
              <motion.i initial={reduced ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            {NODES.map((node, index) => (
              <motion.div className="lc-node" key={node.title} initial={reduced ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}>
                <div className="lc-marker" data-tone={node.tone}><node.icon size={18} strokeWidth={1.6} aria-hidden="true" /></div>
                <div className="lc-card">
                  <h3>{node.title}</h3>
                  <div className="lc-time">{node.time} · illustrative timeline</div>
                  <p>{node.body}</p>
                  {index === 3 && <span className="lc-note"><RotateCcw size={10} aria-hidden="true" /> Reopened by an operator</span>}
                </div>
              </motion.div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="lp-small" style={{ marginTop: 22 }}>
            New alerts after resolution open a fresh incident; reopening an existing incident is a manual console action in this build.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
