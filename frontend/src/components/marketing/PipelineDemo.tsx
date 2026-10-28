"use client";

import { useInView, useReducedMotion } from "framer-motion";
import { Bell, Check, Inbox, Layers, Merge, Pause, Play, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "./primitives";

const STEPS = [
  { label: "Receive", icon: Inbox, caption: "48 alerts arrive at once from PagerDuty, Datadog, GitHub and your monitors.", node: "Listening" },
  { label: "Verify", icon: ShieldCheck, caption: "Each delivery's signature is checked. One unsigned request is turned away with a 401.", node: "Verifying" },
  { label: "Deduplicate", icon: Layers, caption: "Retries are recognised. 35 duplicates are absorbed instead of paging anyone again.", node: "Deduplicating" },
  { label: "Correlate", icon: Merge, caption: "The 12 unique signals share a fingerprint and fold into a single incident.", node: "Correlating" },
  { label: "Respond", icon: Bell, caption: "One incident, one owner. Priya acknowledges it and the audit timeline begins.", node: "Incident open" },
] as const;

const STATS: readonly [number, number, number, number][] = [
  [48, 0, 0, 0],
  [48, 1, 0, 0],
  [48, 1, 35, 0],
  [48, 1, 35, 1],
  [48, 1, 35, 1],
];

type Kind = "unique" | "dup" | "bad";
const ROWS: { source: string; msg: string; kind: Kind; tone: string }[] = [
  { source: "PagerDuty", msg: "p99 latency > 800 ms", kind: "unique", tone: "#ff8fae" },
  { source: "PagerDuty", msg: "p99 latency > 800 ms", kind: "dup", tone: "#ff8fae" },
  { source: "Datadog", msg: "apdex below 0.85", kind: "unique", tone: "#ffc46b" },
  { source: "Datadog", msg: "apdex below 0.85", kind: "dup", tone: "#ffc46b" },
  { source: "Monitor", msg: "checkout /health 503", kind: "unique", tone: "#7ddfb0" },
  { source: "PagerDuty", msg: "p99 latency > 800 ms", kind: "dup", tone: "#ff8fae" },
  { source: "unknown", msg: "unsigned request", kind: "bad", tone: "#cdc3ee" },
];
function rowState(kind: Kind, phase: number): { state: string; label: string } {
  if (kind === "bad") return phase >= 1 ? { state: "bad", label: "401 rejected" } : { state: "received", label: "received" };
  if (kind === "dup") return phase >= 2 ? { state: "dup", label: "absorbed" } : { state: "received", label: "received" };
  if (phase >= 3) return { state: "merged", label: phase >= 4 ? "acknowledged" : "correlated" };
  return { state: "received", label: "received" };
}

export default function PipelineDemo() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);

  const currentPhase = reduce ? 4 : phase;
  const isPlaying = reduce ? false : playing;

  useEffect(() => {
    if (!isPlaying || !inView || reduce) return;
    const timer = window.setTimeout(() => setPhase(current => (current + 1) % STEPS.length), currentPhase === 4 ? 4400 : 3000);
    return () => window.clearTimeout(timer);
  }, [currentPhase, isPlaying, inView, reduce]);

  const [received, rejected, absorbed, incidents] = STATS[currentPhase];
  const step = STEPS[currentPhase];
  const running = isPlaying && inView && !reduce;

  return (
    <section id="pipeline" className="lp-section pd-section" aria-labelledby="pipeline-title">
      <div className="lp-wrap">
        <div className="lp-head">
          <Reveal className="lp-head-copy">
            <span className="lp-eyebrow">How it works</span>
            <h2 id="pipeline-title" className="lp-h2">Watch one incident form</h2>
          </Reveal>
          <Reveal className="lp-head-aside" delay={0.08}>
            <p className="lp-body" style={{ margin: 0 }}>
              An illustrative five-stage scenario. Select any step to pause and inspect it, or let the loop run.
            </p>
          </Reveal>
        </div>

        <Reveal>
          <div className="pd-shell" ref={ref} role="group" aria-label="Interactive pipeline walkthrough">
            <div className="pd-offset" aria-hidden="true" />
            <div className="pd">
              <div className="pd-steps" role="group" aria-label="Pipeline stages">
                {STEPS.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    className="pd-step"
                    data-state={index === currentPhase ? "active" : index < currentPhase ? "done" : "todo"}
                    aria-current={index === currentPhase ? "step" : undefined}
                    onClick={() => { setPhase(index); setPlaying(false); }}
                  >
                    <span className="pd-step-num">{index < currentPhase ? <Check size={11} strokeWidth={2.6} aria-hidden="true" /> : index + 1}</span>
                    <item.icon size={14} strokeWidth={1.7} aria-hidden="true" />
                    <span className="pd-step-label">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="pd-stats" aria-hidden="true">
                <div><span>Received</span><strong key={`a${received}`}>{received}</strong></div>
                <div data-tone={rejected ? "rose" : undefined}><span>Rejected</span><strong key={`b${rejected}`}>{rejected}</strong></div>
                <div data-tone={absorbed ? "amber" : undefined}><span>Duplicates absorbed</span><strong key={`c${absorbed}`}>{absorbed}</strong></div>
                <div data-tone={incidents ? "mint" : undefined}><span>Incidents</span><strong key={`d${incidents}`}>{incidents}</strong></div>
              </div>

              <div className="pd-stage" data-phase={currentPhase}>
                <div className="pd-col pd-col-in">
                  <span className="pd-col-label">Incoming signals</span>
                  <ul className="pd-rows">
                    {ROWS.map((row, index) => {
                      const s = rowState(row.kind, currentPhase);
                      return (
                        <li key={index} className="pd-row" data-state={s.state}>
                          <i style={{ background: row.tone }} />
                          <span className="pd-row-main"><b>{row.source}</b><small>{row.msg}</small></span>
                          <em>
                            {s.state === "bad" ? <X size={10} strokeWidth={2.6} aria-hidden="true" /> : s.state === "merged" ? <Check size={10} strokeWidth={2.6} aria-hidden="true" /> : null}
                            {s.label}
                          </em>
                        </li>
                      );
                    })}
                  </ul>
                  <span className="pd-more">+ 41 more in the same burst</span>
                </div>

                <div className="pd-link pd-link-a" aria-hidden="true" />

                <div className="pd-col pd-col-node">
                  <div className="pd-node">
                    <span className="pd-node-ring" />
                    <span className="pd-node-icon"><step.icon size={26} strokeWidth={1.6} aria-hidden="true" /></span>
                    <strong>SignalBridge</strong>
                    <small key={step.node}>{step.node}</small>
                  </div>
                </div>

                <div className="pd-link pd-link-b" aria-hidden="true" />

                <div className="pd-col pd-col-out">
                  <span className="pd-col-label">One incident</span>
                  <article className="pd-incident" data-live={currentPhase >= 3} data-ack={currentPhase === 4} aria-label="One correlated incident">
                    <div className="pd-inc-top">
                      <span className="pd-pill-crit">
                        <Bell size={11} aria-hidden="true" /> Critical
                      </span>
                      <span className="pd-ref">INC-1047</span>
                    </div>
                    <h3>Checkout API degraded</h3>
                    <p>p95 latency above 800 ms across payments-service.</p>
                    <div className="pd-tags"><span className="pd-tag-hot">12 signals correlated</span><span className="pd-tag-ok">Replays identified</span></div>
                    <div className="pd-inc-foot">
                      <span className="pd-avatar" aria-hidden="true">P</span>
                      <div><strong>{currentPhase === 4 ? "Acknowledged by Priya" : "Awaiting acknowledgment"}</strong><small>{currentPhase === 4 ? "SRE on-call · just now" : "Paging the on-call engineer"}</small></div>
                      <span className="pd-inc-check" aria-hidden="true">
                        <Check size={13} strokeWidth={2.6} />
                      </span>
                    </div>
                  </article>
                </div>
              </div>

              <div className="pd-foot">
                <button type="button" className="pd-play" onClick={() => setPlaying(value => !value)} aria-label={isPlaying ? "Pause walkthrough" : "Play walkthrough"}>
                  {isPlaying ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                </button>
                <p className="pd-caption"><b>{`0${currentPhase + 1}`}</b>{step.caption}</p>
                <span className="pd-progress" aria-hidden="true">
                  <i key={`${currentPhase}-${running}`} data-run={running} style={{ animationDuration: currentPhase === 4 ? "4.4s" : "3s" }} />
                </span>
              </div>
            </div>
            <p className="sr-only">
              Result: 48 alerts arrived, 1 unsigned request was rejected, 35 duplicates were absorbed, and the remaining signals
              became one incident, Checkout API degraded, acknowledged by Priya.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
