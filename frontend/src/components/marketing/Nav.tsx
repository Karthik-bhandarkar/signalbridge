"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import GitHubMark from "@/components/ui/GitHubMark";
import { ButtonLink } from "@/components/ui/controls";
import CommandPalette from "./CommandPalette";
import Logo from "./Logo";
import { DASHBOARD_HREF, DOCS_HREF, GITHUB_URL, navLinks } from "@/lib/site";

type Health = "unknown" | "ok" | "down" | "unavailable";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health>("unknown");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Read the actual health response. An unreachable check is not reported as healthy. */
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    fetch("/api/health", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) { if (mounted) setHealth("down"); return; }
        const body = (await response.json()) as { ok?: boolean; checks?: { pipelineWorker?: { status?: string } } };
        if (mounted) setHealth(body.ok === false || body.checks?.pipelineWorker?.status === "degraded" ? "down" : "ok");
      })
      .catch(() => { if (mounted) setHealth("unavailable"); })
      .finally(() => window.clearTimeout(timeout));
    return () => { mounted = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const statusLabel = health === "ok" ? "Systems operational" : health === "down" ? "Service degraded" : health === "unavailable" ? "Status unavailable" : "Checking status";

  return (
    <>
      <header className={`lp-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <Logo />
          <nav className="lp-nav-links" aria-label="Primary">
            {navLinks.map(link => link.href.startsWith("/#")
              ? <a key={link.label} href={link.href.replace("/", "")}>{link.label}</a>
              : <Link key={link.label} href={link.href}>{link.label}</Link>)}
          </nav>
          <div className="lp-nav-actions">
            <span className="lp-nav-status" data-state={health} role="status" aria-live="polite">
              <i className="lp-dot" aria-hidden="true" />
              {statusLabel}
            </span>
            <button type="button" className="lp-cmdk-trigger" onClick={() => window.dispatchEvent(new Event("sb:command"))} aria-label="Open command palette">
              <Search size={13} aria-hidden="true" />
              <span className="lp-kbd" aria-hidden="true">⌘K</span>
            </button>
            <ButtonLink href={GITHUB_URL} external variant="secondary" size="sm" leadingIcon={<GitHubMark size={14} />}>
              GitHub
            </ButtonLink>
            <ButtonLink href={DASHBOARD_HREF} variant="primary" size="sm" trailingIcon={<ArrowUpRight size={14} aria-hidden="true" />}>
              Open Dashboard
            </ButtonLink>
            <button type="button" className="lp-burger" aria-expanded={open} aria-controls="lp-mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(value => !value)}>
              {open ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div id="lp-mobile-nav" className="lp-sheet" initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, y: -8, height: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              <nav aria-label="Mobile">
                {navLinks.map(link => link.href.startsWith("/#")
                  ? <a key={link.label} href={link.href.replace("/", "")} onClick={() => setOpen(false)}>{link.label}<ArrowUpRight size={13} aria-hidden="true" /></a>
                  : <Link key={link.label} href={link.href} onClick={() => setOpen(false)}>{link.label}<ArrowUpRight size={13} aria-hidden="true" /></Link>)}
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>GitHub<ArrowUpRight size={13} aria-hidden="true" /></a>
                <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event("sb:command")); }}>
                  Search sections <span className="lp-kbd">⌘K</span>
                </button>
              </nav>
              <div className="lp-sheet-status" role="status"><i className="lp-dot" data-health={health} aria-hidden="true" />{statusLabel}</div>
              <div className="lp-sheet-foot">
                <Link href={DASHBOARD_HREF} className="lp-btn lp-btn-primary lp-btn-block" onClick={() => setOpen(false)}>
                  Open Dashboard
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
                <Link href={DOCS_HREF} className="lp-btn lp-btn-ghost lp-btn-block" onClick={() => setOpen(false)}>
                  Read the docs
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
      <CommandPalette />
    </>
  );
}
