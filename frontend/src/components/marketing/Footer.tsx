import Link from "next/link";
import { ArrowUpRight, Heart } from "lucide-react";
import Logo from "./Logo";
import { Badge } from "@/components/ui/controls";
import { DOCS_HREF, GITHUB_URL } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="ft">
      <div className="ft-globe" aria-hidden="true"><i /></div>
      <div className="lp-wrap">
        <div className="ft-grid">
          <div className="ft-brand">
            <Logo />
            <p>Turn alert noise into a clearer incident and an actionable history.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
              <Badge tone="success">MIT licensed</Badge>
              <Badge tone="neutral">self-hosted</Badge>
            </div>
          </div>

          <div className="ft-col">
            <h4>Product</h4>
            <a href="#product">What it does</a>
            <a href="#pipeline">How it works</a>
            <a href="#features">Features</a>
            <a href="#reliability">Incident lifecycle</a>
          </div>

          <div className="ft-col">
            <h4>Resources</h4>
            <Link href={DOCS_HREF}>Documentation</Link>
            <a href="#security">Under the hood</a>
            <a href="#quickstart">Quickstart</a>
            <a href="/api/health">System health</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={10} aria-hidden="true" style={{ display: "inline" }} /></a>
          </div>

          <div className="ft-col">
            <h4>Project</h4>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">Source code</a>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT license</a>
            <Link href="/dashboard">Operator dashboard</Link>
            <Link href="/case-study.html">Case study</Link>
          </div>
        </div>

        <div className="ft-bottom">
          <span>© {new Date().getFullYear()} SignalBridge</span>
          <span>Built by Karthik Bhandarkar <Heart size={11} aria-hidden="true" style={{ color: "var(--danger)" }} /></span>
          <span className="lp-mono" style={{ letterSpacing: "0.04em" }}>DEMO ENVIRONMENT · NOT A PRODUCTION SLA</span>
        </div>
      </div>
    </footer>
  );
}
