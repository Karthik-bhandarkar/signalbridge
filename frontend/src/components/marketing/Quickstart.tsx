"use client";

import { ArrowUpRight, BookOpen, Terminal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CopyButton, Reveal } from "./primitives";
import { DOCS_HREF, GITHUB_URL } from "@/lib/site";

const SETUP = `# From the current project directory
npm install

# Set DATABASE_URL in .env for your PostgreSQL instance
npx drizzle-kit push

# Start the landing page and console
npm run dev`;
const INSPECT = `# Check that the running app can reach its database
curl http://localhost:3000/api/health

# Inspect the demo instance's measured pipeline data
curl http://localhost:3000/api/metrics`;

export default function Quickstart() {
  const [tab, setTab] = useState<"setup" | "inspect">("setup");
  const code = tab === "setup" ? SETUP : INSPECT;
  return (
    <section id="quickstart" className="lp-section" aria-labelledby="quickstart-title">
      <div className="lp-wrap"><div className="qs">
        <Reveal><span className="lp-eyebrow">Quickstart</span><h2 id="quickstart-title" className="lp-h2">Run the project locally.</h2><p className="lp-lede">Configure PostgreSQL, apply the schema, then start the Next.js app. The demo workspace is seeded on first boot.</p><div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 22 }}><div className="qs-tabs" role="tablist" aria-label="Quickstart examples">{(["setup", "inspect"] as const).map(item => <button key={item} type="button" role="tab" aria-selected={tab === item} className="qs-tab" data-active={tab === item} onClick={() => setTab(item)}>{item === "setup" ? "Setup" : "Inspect"}</button>)}</div><span className="lp-small" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Terminal size={11} aria-hidden="true" /> Next.js · PostgreSQL · Drizzle</span></div><div style={{ display: "flex", gap: 18, marginTop: 22, flexWrap: "wrap" }}><Link href={DOCS_HREF} className="lp-link" style={{ fontSize: 13 }}><BookOpen size={13} />Read the docs</Link><a href={GITHUB_URL} target="_blank" rel="noreferrer" className="lp-link" style={{ fontSize: 13 }}>Project repository<ArrowUpRight size={13} /></a></div></Reveal>
        <Reveal delay={0.08}><div className="qs-code"><div className="qs-code-bar"><span>terminal · {tab}</span><CopyButton text={code} label="Copy quickstart" /></div><pre className="qs-pre"><code>{code}</code></pre></div><p className="lp-small" style={{ marginTop: 10 }}>The linked repository describes the broader reference architecture; this workspace runs the Next.js/PostgreSQL implementation documented above.</p></Reveal>
      </div></div>
    </section>
  );
}
