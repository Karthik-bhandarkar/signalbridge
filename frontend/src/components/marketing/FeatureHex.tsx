import { Activity, Archive, CopyCheck, HeartPulse, Merge, ShieldCheck } from "lucide-react";
import { Reveal } from "./primitives";

/** Answers "what problem does it solve / what does it do" with six verified behaviours (no invented claims). */
const FEATURES = [
  { icon: ShieldCheck, label: "We verify", title: "Signed at the door", body: "Each delivery is checked against its source signing key. Invalid signatures are rejected before an event is stored." },
  { icon: CopyCheck, label: "We deduplicate", title: "Retries stay visible", body: "A replay is recorded as a duplicate and does not update the incident a second time." },
  { icon: Merge, label: "We correlate", title: "Related signals, one incident", body: "Events with the same service and event-type fingerprint can join an active incident in a 30-minute window." },
  { icon: HeartPulse, label: "We record", title: "A stage-by-stage ledger", body: "Verification, deduplication, correlation, escalation and payload storage produce a visible processing trace." },
  { icon: Activity, label: "We observe", title: "Health and metrics", body: "The console reports database health, delivery volume, pipeline timings and recorded outcomes." },
  { icon: Archive, label: "We retain", title: "Payloads in Postgres", body: "Raw JSON payloads are stored in PostgreSQL with an archive key; external object storage is not wired in this demo." },
] as const;

function Hex() {
  return (
    <svg className="hexf-hex" viewBox="0 0 72 80" aria-hidden="true">
      <polygon points="36,2 70,21 70,59 36,78 2,59 2,21" />
    </svg>
  );
}

export default function FeatureHex() {
  return (
    <section id="product" className="hexf" aria-labelledby="product-title">
      <div className="lp-wrap">
        <Reveal>
          <span className="lp-eyebrow">What it does</span>
          <h2 id="product-title" className="lp-h2" style={{ marginBottom: "clamp(28px,3.4vw,44px)" }}>
            One pipeline between a webhook and a decision.
          </h2>
        </Reveal>
        <div className="hexf-grid">
          {FEATURES.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.06}>
              <article className="hexf-item">
                <span className="hexf-icon">
                  <Hex />
                  <item.icon size={24} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div>
                  <span className="hexf-label">{item.label}</span>
                  <h3 className="hexf-title">{item.title}</h3>
                  <p className="hexf-body">{item.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
