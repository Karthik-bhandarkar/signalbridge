import { ArrowUpRight, Star } from "lucide-react";
import { ButtonLink } from "@/components/ui/controls";
import { Reveal } from "./primitives";
import { DASHBOARD_HREF, GITHUB_URL } from "@/lib/site";

export default function FinalCTA() {
  return (
    <section className="lp-section-tight" aria-labelledby="cta-title">
      <div className="lp-wrap">
        <Reveal>
          <div className="cta-card">
            <span className="lp-eyebrow">The next alert is already on its way</span>
            <h2 id="cta-title">Stop drowning in alerts.</h2>
            <p>Give every signal a destination, every incident an owner, and every on-call week a little more sleep.</p>
            <div className="cta-actions">
              <ButtonLink href={DASHBOARD_HREF} variant="primary" size="lg" trailingIcon={<ArrowUpRight size={16} aria-hidden="true" />}>
                Open Dashboard
              </ButtonLink>
              <ButtonLink href={GITHUB_URL} external variant="secondary" size="lg" leadingIcon={<Star size={15} aria-hidden="true" />}>
                Star on GitHub
              </ButtonLink>
            </div>
            <p className="lp-small" style={{ marginTop: 16 }}>MIT licensed · self-hosted · no credit card</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
