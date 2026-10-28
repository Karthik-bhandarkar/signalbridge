import { ArrowDown, ArrowUpRight, Check } from "lucide-react";
import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/controls";
import { DASHBOARD_HREF } from "@/lib/site";
import WorkflowVisual from "./WorkflowVisual";
import styles from "./Hero.module.css";

/** Keep the established four-line message and actions, now adjacent to the
 * workflow itself. On touch widths the DOM order is copy, actions, diagram,
 * attributes; on desktop the diagram occupies the left region. */
const LINES = [
  { text: "Turn alert", emphasis: false },
  { text: "noise into", emphasis: false },
  { text: "one clear", emphasis: true },
  { text: "incident.", emphasis: true },
] as const;

export default function Hero({ avgLatencyMs }: { avgLatencyMs: number }) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title" data-hero>
      <div className={styles.illumination} aria-hidden="true" />
      <div className={styles.grid}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>Webhook ingestion · Event correlation · Incident response</span>
          <h1 id="hero-title" className={styles.headline}>
            {LINES.map((line, index) => (
              <span className={styles.line} key={line.text}>
                <span className={line.emphasis ? styles.emphasis : undefined} style={{ "--line-order": index } as CSSProperties}>{line.text}</span>
              </span>
            ))}
          </h1>
          <p className={styles.description}>
            SignalBridge verifies signed webhooks, filters duplicate deliveries, and groups related alerts into
            incidents — so your team can see what matters and respond with context.
          </p>
          <div className={styles.actions}>
            <ButtonLink href={DASHBOARD_HREF} variant="primary" size="lg" trailingIcon={<ArrowUpRight size={16} aria-hidden="true" />}>
              Open Dashboard
            </ButtonLink>
            <ButtonLink href="#pipeline" variant="secondary" size="lg" trailingIcon={<ArrowDown size={16} aria-hidden="true" />}>
              See It Work
            </ButtonLink>
          </div>
        </div>

        <div className={styles.visual}>
          <WorkflowVisual avgLatencyMs={avgLatencyMs} />
        </div>

        <div className={styles.attributes} aria-label="Implemented project attributes">
          <span><Check size={13} aria-hidden="true" /> Signed deliveries</span>
          <span><Check size={13} aria-hidden="true" /> Duplicate detection</span>
          <span><Check size={13} aria-hidden="true" /> Operator workflows</span>
        </div>
      </div>
    </section>
  );
}
