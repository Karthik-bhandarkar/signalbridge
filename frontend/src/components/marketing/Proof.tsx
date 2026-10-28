import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CountUp, Reveal } from "./primitives";
import { DOCS_HREF } from "@/lib/site";
import type { LandingMetrics } from "@/lib/metrics";

/**
 * Every number here is queried from this running instance's own Postgres
 * database at request time (see src/lib/metrics.ts) — nothing is invented.
 * A fresh instance with little seeded traffic will show small, honest numbers;
 * that is the point.
 */
export default function Proof({ metrics }: { metrics: LandingMetrics }) {
  const items = [
    { value: metrics.eventsTotal, decimals: 0, suffix: "", label: "Webhook deliveries recorded", cap: "Processed deliveries and replays across this instance." },
    { value: Math.round(metrics.verifiedRate * 100), decimals: 0, suffix: "%", label: "Signatures verified", cap: "Share of stored deliveries with a valid signature." },
    { value: Math.round(metrics.dedupeRate * 100), decimals: 0, suffix: "%", label: "Deliveries marked duplicate", cap: `${metrics.duplicatesBlocked} replay deliveries recorded without repeating incident updates.` },
    { value: metrics.p95LatencyMs, decimals: 0, suffix: " ms", label: "p95 pipeline latency", cap: "Verify → dedupe → correlate → archive, end to end." },
  ];

  return (
    <section id="proof" className="lp-section-tight" aria-labelledby="proof-title">
      <div className="lp-wrap">
        <Reveal>
          <div className="lp-head" style={{ marginBottom: 28 }}>
            <div>
              <span className="lp-eyebrow">Evidence</span>
              <h2 id="proof-title" className="lp-h2" style={{ fontSize: "clamp(26px, 3vw, 34px)" }}>Numbers from this instance, not a slide.</h2>
            </div>
            <p className="lp-small" style={{ maxWidth: 320, margin: 0 }}>
              Queried live from this demo&apos;s database on every page load. Open <Link href="/api/metrics" className="lp-link">/api/metrics</Link> to see the raw response.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="proof-grid">
            {items.map(item => (
              <div className="proof-item" key={item.label}>
                <div className="proof-num"><CountUp value={item.value} decimals={item.decimals} suffix={item.suffix} label={`${item.value}${item.suffix}`} /></div>
                <div className="proof-label">{item.label}</div>
                <div className="proof-cap">{item.cap}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <p className="lp-small" style={{ marginTop: 16 }}>
            {metrics.incidentsTotal > 0
              ? <>{metrics.incidentsTotal} incident{metrics.incidentsTotal === 1 ? "" : "s"} recorded · average {metrics.correlationRatio.toFixed(1)} signals correlated into each one · mean time to acknowledge {metrics.mttaMinutes} min.</>
              : "No incidents recorded yet on this instance — send a webhook from the quickstart below to create the first one."}
          </p>
          <Link href={DOCS_HREF} className="proof-link" style={{ marginTop: 10, display: "inline-flex" }}>
            Read the API reference behind these numbers
            <ArrowUpRight size={11} aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
