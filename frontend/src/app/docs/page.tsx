import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, LockKeyhole, Terminal } from "lucide-react";
import ActionLink from "@/components/ui/ActionLink";
import Brand from "@/components/ui/Brand";
import CodeBlock from "@/components/landing/CodeBlock";
import type { Metadata } from "next";

export const metadata: Metadata = {title:"API reference — SignalBridge",description:"Sign and send your first webhook. Endpoint contracts, idempotency, correlation policy, and the current SignalBridge architecture."};
const endpoints = [
  {method:"POST",path:"/api/v1/webhooks/:source",desc:"Verify and process a signed webhook delivery.",detail:"Required: x-signalbridge-signature: sha256=<hex HMAC-SHA256 of raw body>. Optional: x-idempotency-key. Sources: prometheus-prod, github-deploys, stripe-billing, cloudwatch-edge.",status:"202 accepted · 200 duplicate · 401 invalid signature · 404 unknown source"},
  {method:"GET",path:"/api/events",desc:"Read the most recent webhook deliveries.",detail:"Query parameters: severity (all, critical, warning, info), status (all, processed, duplicate), limit (up to 100). Returns event metadata, incident IDs, archive keys and processing timings. Raw payloads are available inside the authenticated console.",status:"200 { count, events }",link:"/api/events?limit=5"},
  {method:"GET",path:"/api/incidents",desc:"List correlated incidents and their operational state.",detail:"Query parameters: status (active, open, acknowledged, resolved, all), severity (all, critical, warning, info), limit. The console provides authenticated acknowledge, resolve, reopen, escalate and note actions.",status:"200 { count, incidents }",link:"/api/incidents?limit=5"},
  {method:"GET",path:"/api/metrics",desc:"Query the measured state of this demo instance.",detail:"Returns aggregate event counts, verification and dedupe rates, latency percentiles, MTTA/MTTR, hourly delivery volume and per-stage ledger statistics. Demo history is seeded through the actual ingest pipeline.",status:"200 { metrics, hourly, stages, generatedAt }",link:"/api/metrics"},
  {method:"GET",path:"/api/health",desc:"Check database connectivity and pipeline health.",detail:"Returns per-component state: database latency, ingest edge activity, worker stage failures, rejected signatures, and archive storage driver. A rejected signature is successful enforcement, not a worker failure.",status:"200 healthy · 500 database unavailable",link:"/api/health"},
];

export default function DocsPage() {
  return <div className="sb-site sb-docs-page" style={{minHeight:"100vh"}}>
    <header className="sb-docs-header"><div className="sb-container"><Link href="/" aria-label="SignalBridge home"><Brand /></Link><span>Developer documentation</span><ActionLink href="/login" small>Open console</ActionLink></div></header>
    <div className="sb-container sb-docs-layout">
      <aside className="sb-docs-sidebar"><Link href="/" className="sb-text-link"><ArrowLeft size={12} />Back to product</Link><span className="sb-eyebrow" style={{marginTop:33}}>Reference</span><nav aria-label="Documentation sections"><a href="#quickstart">Quick start</a><a href="#endpoints">Endpoints</a><a href="#responses">Response contract</a><a href="#policy">Correlation & escalation</a><a href="#architecture">Current architecture</a><Link href="/#pipeline">Pipeline walkthrough<ArrowUpRight size={10} /></Link></nav></aside>
      <main className="sb-docs-content">
        <section id="quickstart"><span className="sb-eyebrow">API v1</span><h1 className="sb-heading" style={{fontSize:52}}>Your first signal.</h1><p className="sb-copy" style={{maxWidth:580,marginTop:20}}>A small API with an explicit contract. Sign the exact bytes you send, give the delivery an idempotency key, and let the pipeline do the rest.</p><div className="sb-docs-callout"><LockKeyhole size={16} /><p>Source signing keys stay server-side. Configure your own source secrets for external integrations. The public sandbox signs requests for its demo sources without exposing those keys.</p></div><CodeBlock caption="sign-and-send.sh" code={`export SIGNALBRIDGE_URL="https://your-deployment.example"
export WEBHOOK_SECRET="<your-source-signing-secret>"
BODY='{"event":"alert.firing","service":"checkout-api","severity":"critical"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 \\
  -hmac "$WEBHOOK_SECRET" -r | cut -d' ' -f1)

curl -X POST "$SIGNALBRIDGE_URL/api/v1/webhooks/prometheus-prod" \\
  -H "Content-Type: application/json" \\
  -H "X-SignalBridge-Signature: sha256=$SIG" \\
  -H "X-Idempotency-Key: alert-7731" \\
  -d "$BODY"`} /></section>
        <section id="endpoints"><h2 className="sb-docs-h2">Endpoints</h2><p className="sb-docs-body">Read endpoints expose this shared demo instance’s seeded data publicly. Console mutations require an authenticated operator session.</p><div className="sb-docs-endpoints">{endpoints.map(endpoint=><article key={endpoint.path}><div className="sb-docs-endpoint-head"><span>{endpoint.method}</span><code>{endpoint.path}</code>{endpoint.link && <Link href={endpoint.link} aria-label={`Open ${endpoint.path}`}><ArrowUpRight size={14} /></Link>}</div><h3>{endpoint.desc}</h3><p>{endpoint.detail}</p><small>{endpoint.status}</small></article>)}</div></section>
        <section id="responses"><h2 className="sb-docs-h2">An explicit response.</h2><p className="sb-docs-body">Every accepted event includes its incident reference, correlation result and per-stage trace. Replays return 200 with duplicate: true and no downstream incident changes.</p><CodeBlock caption="202 accepted · illustrative response" code={`{
  "accepted": true,
  "duplicate": false,
  "event_id": 91,
  "incident": "INC-1236",
  "correlated": true,
  "severity": "critical",
  "escalation_level": 3,
  "archive_key": "signalbridge-archive/2026/10/27/alert-7731.json",
  "processing_ms": 12,
  "pipeline": [
    { "stage": "verify", "status": "succeeded", "durationMs": 1 }
  ]
}`} /></section>
        <section id="policy"><h2 className="sb-docs-h2">One policy. Clear outcomes.</h2><p className="sb-docs-body">The fingerprint is sha256(service :: event_type), truncated to 16 hexadecimal characters. Open and acknowledged incidents with a matching fingerprint inside 30 minutes absorb new signals. A resolved incident does not absorb new events.</p><div className="sb-docs-policy">{[{level:"L1",text:"The first signal, unless it is critical."},{level:"L2",text:"At least 3 correlated signals, or critical severity."},{level:"L3",text:"At least 6 signals, or critical severity with 3 or more signals."}].map(item=><div key={item.level}><code>{item.level}</code><span>{item.text}</span></div>)}</div><p className="sb-docs-body">The highest severity is retained as more signals arrive. A level change appends an escalation-policy entry to the incident timeline. Operators can also escalate manually from the console.</p></section>
        <section id="architecture"><h2 className="sb-docs-h2">What runs in this build.</h2><p className="sb-docs-body">This repository is a Next.js App Router application, not the Django/Vite reference architecture. The website describes the actual implementation.</p><ul className="sb-docs-list">{["React 19, TypeScript, Next.js route handlers and server actions.","PostgreSQL with Drizzle ORM: events, incidents, timelines, sources, operators and task runs.","HMAC verification, idempotency lookup, normalization, correlation and escalation execute inline.","Raw event payloads are persisted as PostgreSQL JSONB, with date-partitioned archive keys and byte counts.","Signed cookie sessions protect the console; demo credentials are shown on the login screen."].map(item=><li key={item}><Check size={13} /><span>{item}</span></li>)}</ul><div className="sb-docs-callout"><Terminal size={16} /><p>Redis, Celery, S3, Terraform and GitHub Actions are deployment-track concepts. They are not wired into this demo. The task-run ledger is not an asynchronous queue, and archive keys do not imply an S3 upload.</p></div><ActionLink href="/login" small>Inspect the workspace</ActionLink></section>
      </main>
    </div>
    <footer className="sb-docs-bottom sb-container"><Brand /><span>Clear signals. Explicit contracts.</span><Link href="/">Back to product<ArrowUpRight size={12} /></Link></footer>
  </div>;
}
