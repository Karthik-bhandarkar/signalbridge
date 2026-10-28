import Link from "next/link";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import "@/styles/tokens.css";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="nf">
      <div className="nf-inner">
        <span className="nf-code">404 · SIGNAL NOT FOUND</span>
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" style={{ margin: "22px auto 0", display: "block", color: "#C58BFF" }}>
          <rect x="4" y="4" width="48" height="48" rx="14" fill="#44357F" stroke="#6E5CB0" />
          <path d="M17 36V26a11 11 0 0 1 22 0v10M22 36V26a6 6 0 0 1 12 0v10M17 31h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="40" cy="16" r="5" fill="#FF8FAE" stroke="#35275F" strokeWidth="2" />
        </svg>
        <h1>This route never made it through ingest.</h1>
        <p>The page you were looking for does not exist or has moved. The dashboard is still exactly where you left it.</p>
        <div className="nf-actions">
          <Link href="/" className="lp-btn lp-btn-primary">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to SignalBridge
          </Link>
          <Link href="/dashboard" className="lp-btn lp-btn-ghost">
            <LifeBuoy size={15} aria-hidden="true" />
            Open dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
