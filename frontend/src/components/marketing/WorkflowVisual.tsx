"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Bell, Check, Pause, Play, Radio } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { BridgeGlyph } from "./Logo";
import styles from "./WorkflowVisual.module.css";

export const WORKFLOW_CYCLE_SECONDS = 9;

const SIGNALS = [
  { label: "Monitor", description: "us-east failed", tone: "rose", x: 7, y: 13 },
  { label: "GitHub", description: "rollback queued", tone: "sand", x: 19, y: 36 },
  { label: "Datadog", description: "CPU saturation", tone: "amber", x: 5, y: 62 },
  { label: "PagerDuty", description: "service degraded", tone: "rose", x: 24, y: 80 },
] as const;

type Point = { x: number; y: number };
type Curve = { start: Point; a: Point; b: Point; end: Point; d: string };
type Geometry = { width: number; height: number; incoming: Curve[]; outgoing: Curve };

function curve(start: Point, a: Point, b: Point, end: Point): Curve {
  return { start, a, b, end, d: `M ${start.x} ${start.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${end.x} ${end.y}` };
}

function onCurve(path: Curve, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * path.start.x + 3 * u * u * t * path.a.x + 3 * u * t * t * path.b.x + t * t * t * path.end.x,
    y: u * u * u * path.start.y + 3 * u * u * t * path.a.y + 3 * u * t * t * path.b.y + t * t * t * path.end.y,
  };
}

function normalise(value: number, start: number, end: number) {
  return Math.max(0, Math.min(1, (value - start) / (end - start)));
}

function phaseAt(progress: number) {
  if (progress < 0.18) return "signals-arrive";
  if (progress < 0.49) return "signals-travel";
  if (progress < 0.58) return "processing";
  if (progress < 0.72) return "incident-connection";
  if (progress < 0.81) return "incident-response";
  if (progress < 0.9) return "confirmation";
  return "completed";
}

/** Every particle reads the same clock. The SVG paths are measured from the
 * actual HTML card boundaries, so resize and stacked layouts stay connected. */
function SignalParticle({ clock, path, start, end, output = false }: { clock: MotionValue<number>; path: Curve; start: number; end: number; output?: boolean }) {
  const x = useTransform(clock, value => onCurve(path, normalise(value, start, end)).x);
  const y = useTransform(clock, value => onCurve(path, normalise(value, start, end)).y);
  const opacity = useTransform(clock, [0, start, start + 0.015, end - 0.015, end, 1], [0, 0, 1, 1, 0, 0]);
  return (
    <motion.g style={{ x, y, opacity }} data-signal-marker={output ? "outgoing" : "incoming"}>
      <circle r={output ? 7 : 6} fill={output ? "var(--wf-accent)" : "var(--wf-dot)"} opacity=".11" />
      <circle r={output ? 2.8 : 2.5} fill={output ? "var(--wf-accent)" : "var(--wf-dot)"} />
    </motion.g>
  );
}

function SignalLabel({ signal, index, clock, motionEnabled }: { signal: (typeof SIGNALS)[number]; index: number; clock: MotionValue<number>; motionEnabled: boolean }) {
  const start = index * 0.025;
  const opacity = useTransform(clock, [0, start, start + 0.075, 0.96, 1], [0.78, 0.78, 1, 1, 0.78]);
  const y = useTransform(clock, [0, start, start + 0.075, 0.96, 1], [5, 5, 0, 0, 5]);
  return (
    <motion.div
      className={`${styles.chip} ${styles[signal.tone]}`}
      style={motionEnabled ? { opacity, y } : undefined}
    >
      <i aria-hidden="true" />
      <span><strong>{signal.label}</strong><small>{signal.description}</small></span>
    </motion.div>
  );
}

export default function WorkflowVisual({ avgLatencyMs }: { avgLatencyMs: number }) {
  const figureRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nodeRef = useRef<HTMLDivElement>(null);
  const incidentRef = useRef<HTMLDivElement>(null);
  const playback = useRef<ReturnType<typeof animate> | null>(null);
  const clock = useMotionValue(0);
  const inView = useInView(figureRef, { amount: 0.12, initial: true });
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [phase, setPhase] = useState("signals-arrive");
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const descriptionId = useId();
  const running = playing && inView && tabVisible && !reduced;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let frame = 0;
    const measure = () => {
      const node = nodeRef.current;
      const incident = incidentRef.current;
      if (!node || !incident || chipRefs.current.some(chip => !chip)) return;
      const origin = scene.getBoundingClientRect();
      if (!origin.width || !origin.height) return;
      const box = (element: HTMLElement) => {
        const r = element.getBoundingClientRect();
        return { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top, cx: r.left - origin.left + r.width / 2, cy: r.top - origin.top + r.height / 2 };
      };
      const processor = box(node);
      const outcome = box(incident);
      const vertical = origin.width < 540;
      const incoming = chipRefs.current.map((chip, index) => {
        const source = box(chip!);
        if (vertical) {
          const target = { x: processor.cx + (index - 1.5) * 8, y: processor.top - 2 };
          const start = { x: source.cx, y: source.bottom + 2 };
          const gap = Math.max(10, target.y - start.y);
          return curve(start, { x: start.x, y: start.y + gap * 0.6 }, { x: target.x, y: target.y - gap * 0.2 }, target);
        }
        const start = { x: source.right + 3, y: source.cy };
        const target = { x: processor.left - 2, y: processor.cy + (index - 1.5) * 9 };
        const gap = Math.max(12, target.x - start.x);
        return curve(start, { x: start.x + gap * 0.52, y: start.y }, { x: target.x - gap * 0.28, y: target.y }, target);
      });
      const start = vertical ? { x: processor.cx, y: processor.bottom + 2 } : { x: processor.right + 2, y: processor.cy };
      const end = vertical ? { x: outcome.cx, y: outcome.top - 2 } : { x: outcome.left - 2, y: outcome.cy };
      const outgoing = curve(start, { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 }, { x: start.x + (end.x - start.x) * 2 / 3, y: start.y + (end.y - start.y) * 2 / 3 }, end);
      setGeometry({ width: origin.width, height: origin.height, incoming, outgoing });
    };
    const schedule = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(scene);
    if (nodeRef.current) observer.observe(nodeRef.current);
    if (incidentRef.current) observer.observe(incidentRef.current);
    chipRefs.current.forEach(chip => { if (chip) observer.observe(chip); });
    document.fonts.ready.then(schedule);
    window.addEventListener("resize", schedule);
    schedule();
    return () => { observer.disconnect(); window.removeEventListener("resize", schedule); window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const controls = animate(clock, [0, 1], { duration: WORKFLOW_CYCLE_SECONDS, ease: "linear", repeat: Infinity });
    controls.pause();
    playback.current = controls;
    return () => { controls.stop(); playback.current = null; };
  }, [clock]);

  useEffect(() => {
    if (reduced) { playback.current?.pause(); clock.set(0.93); }
    else if (running) playback.current?.play();
    else playback.current?.pause();
  }, [clock, reduced, running]);

  useEffect(() => clock.on("change", value => setPhase(current => { const next = phaseAt(value); return current === next ? current : next; })), [clock]);
  useEffect(() => {
    const change = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    change();
    return () => document.removeEventListener("visibilitychange", change);
  }, []);

  const processing = useTransform(clock, [0, 0.31, 0.36, 0.42, 0.49, 0.55, 0.6, 1], [0.05, 0.05, 0.65, 0.18, 0.75, 0.3, 0.05, 0.05]);
  const response = useTransform(clock, [0, 0.71, 0.75, 0.81, 1], [0, 0, 0.9, 0, 0]);
  const confirmation = useTransform(clock, [0, 0.79, 0.84, 0.91, 1], [0, 0, 0.85, 0, 0]);
  const latency = avgLatencyMs > 0 ? `${avgLatencyMs} ms avg. ingestion` : "Timing not measured";

  return (
    <figure ref={figureRef} className={styles.figure} aria-describedby={descriptionId} data-workflow-visual data-workflow-phase={reduced ? "static" : phase} data-animation-playing={running} data-cycle-seconds={WORKFLOW_CYCLE_SECONDS}>
      <div className={styles.panel}>
        <div className={styles.labels}>
          <span>Incoming signals</span>
          <span>Verify + Deduplicate + Correlate</span>
          <span>One incident</span>
        </div>

        <div ref={sceneRef} className={styles.scene} role="img" aria-label="Example workflow: Monitor, GitHub, Datadog and PagerDuty signals follow curved dashed paths through SignalBridge and produce one acknowledged incident. Incident details are demonstration data.">
          {geometry && <svg className={styles.paths} width="100%" height="100%" viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
            {geometry.incoming.map((path, index) => <g key={index}>
              <path d={path.d} className={styles.incomingPath} data-incoming-path />
              {!reduced && <SignalParticle clock={clock} path={path} start={0.17 + index * 0.045} end={0.35 + index * 0.045} />}
            </g>)}
            <path d={geometry.outgoing.d} className={styles.outgoingPath} data-outgoing-path />
            {!reduced && <SignalParticle clock={clock} path={geometry.outgoing} start={0.58} end={0.72} output />}
          </svg>}

          <div className={styles.incoming}>
            {SIGNALS.map((signal, index) => <div key={signal.label} ref={element => { chipRefs.current[index] = element; }} className={styles.chipAnchor} style={{ "--chip-x": `${signal.x}%`, "--chip-y": `${signal.y}%` } as CSSProperties}>
              <SignalLabel signal={signal} index={index} clock={clock} motionEnabled={!reduced} />
            </div>)}
          </div>

          <div ref={nodeRef} className={styles.node}>
            <div className={styles.nodeGlow} aria-hidden="true" />
            <motion.div className={styles.processingGlow} style={{ opacity: reduced ? 0 : processing }} aria-hidden="true" data-processing-response />
            <div className={styles.nodeCard}>
              <span className={styles.nodeIcon}><BridgeGlyph size={25} /></span>
              <strong>SignalBridge</strong>
              <small>{latency}</small>
            </div>
          </div>

          <div ref={incidentRef} className={styles.incidentAnchor}>
            <article className={styles.incident} aria-label="Demonstration incident INC-1047">
              <motion.span className={styles.cardHighlight} style={{ opacity: reduced ? 0 : response }} aria-hidden="true" data-incident-response />
              <div className={styles.incidentTop}><span className={styles.severity}><Bell size={11} aria-hidden="true" />Critical</span><span className={styles.reference}>INC-1047</span></div>
              <h3>Checkout API degraded</h3>
              <p>p95 latency above 800 ms across payments-service.</p>
              <div className={styles.tags}>
                <span className={styles.grouped}>47 alerts grouped</span>
                <span className={styles.clean}>No duplicates</span>
                <motion.span className={styles.badgeHighlight} style={{ opacity: reduced ? 0 : confirmation }} aria-hidden="true" data-badges-response />
              </div>
              <div className={styles.acknowledgment}><span className={styles.avatar} aria-hidden="true">P</span><div><strong>Acknowledged by Priya</strong><small>SRE on-call, just now</small></div><Check className={styles.check} size={16} aria-hidden="true" /></div>
            </article>
          </div>
        </div>

        <div className={styles.status}>
          <motion.span className={styles.statusHighlight} style={{ opacity: reduced ? 0 : confirmation }} aria-hidden="true" data-confirmation-response />
          <Radio size={14} aria-hidden="true" />
          <span>Signal received. Duplicate absorbed. Incident calm.</span>
        </div>
      </div>
      <figcaption className={styles.caption} id={descriptionId}>
        <span>Illustrative scenario · latency is this demo instance’s measured average.</span>
        <button type="button" className={styles.motionControl} onClick={() => setPlaying(value => !value)} disabled={Boolean(reduced)} aria-pressed={!playing} aria-label={playing ? "Pause workflow animation" : "Resume workflow animation"}>
          {reduced ? <Check size={12} /> : playing ? <Pause size={12} /> : <Play size={12} />}
          {reduced ? "Motion reduced" : playing ? "Pause" : "Resume"}
        </button>
      </figcaption>
    </figure>
  );
}
