"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Activity, ArrowUpRight, BookOpen, ChevronRight, CircleDot, Command, LayoutGrid, LogOut, Menu, Radio, RefreshCw, Search, X } from "lucide-react";
import Brand from "@/components/ui/Brand";
import SubmitButton from "./SubmitButton";
import { logoutAction, simulateTrafficAction } from "@/lib/actions";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/incidents", label: "Incidents", icon: CircleDot },
  { href: "/dashboard/events", label: "Event stream", icon: Radio },
  { href: "/dashboard/system", label: "System health", icon: Activity },
];

export default function Shell({
  children,
  user,
  openIncidents,
  critical,
}: {
  children: ReactNode;
  user?: { name: string; email: string; role: string } | null;
  openIncidents: number;
  critical: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const search = useRef<HTMLInputElement>(null);
  const active = [...nav].reverse().find(item => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))) ?? nav[0];
  const initials = user?.name ? user.name.split(" ").map(part => part[0]).slice(0, 2).join("") : "OP";

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenu(false); setSearchOpen(false); search.current?.blur(); }
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        setSearchOpen(true);
        window.requestAnimationFrame(() => search.current?.focus());
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  return (
    <div className="ops-app">
      <aside className={`ops-sidebar ${menu ? "is-open" : ""}`}>
        <div className="ops-sidebar-top"><Link href="/dashboard" aria-label="SignalBridge overview"><Brand /></Link></div>
        <div className="ops-workspace-select">
          <span className="ops-workspace-icon"><Command size={16} /></span>
          <div>
            <strong>Production Gateway</strong>
            <small>AWS EC2 · us-east-1</small>
          </div>
        </div>
        <nav className="ops-nav" aria-label="Workspace navigation">
          <p className="ops-nav-label">Workspace</p>
          {nav.map(item => (
            <Link
              href={item.href}
              key={item.href}
              className={`ops-nav-link ${item.href === active.href ? "active" : ""}`}
              onClick={() => setMenu(false)}
              aria-current={item.href === active.href ? "page" : undefined}
            >
              <item.icon />
              {item.label}
              {item.href === "/dashboard/incidents" && openIncidents > 0 && (
                <span className="ops-nav-count">{openIncidents}</span>
              )}
            </Link>
          ))}
          <p className="ops-nav-label" style={{ marginTop: 29 }}>Resources</p>
          <Link href="/docs" className="ops-nav-link"><BookOpen />API documentation<ArrowUpRight size={12} style={{ marginLeft: "auto" }} /></Link>
          <Link href="/" className="ops-nav-link"><ArrowUpRight />Back to product</Link>
        </nav>
        <div className="ops-sidebar-spacer" />
        <div className="ops-sidebar-status">
          <span><i className="sb-status-dot" />Live Ingestion Engine</span>
          <p>HMAC-SHA256 · PostgreSQL<br />Redis correlation · S3 cold tier</p>
        </div>
        {user ? (
          <div className="ops-user">
            <span className="ops-avatar">{initials}</span>
            <div><strong>{user.name}</strong><small>{user.role.replace(/-/g, " ")}</small></div>
            <form action={logoutAction}>
              <button className="ops-signout" type="submit" aria-label="Sign out" title="Sign out"><LogOut size={14} /></button>
            </form>
          </div>
        ) : (
          <div className="ops-user">
            <span className="ops-avatar" style={{ background: "rgba(79, 140, 255, 0.2)", color: "#58A6FF" }}>👁️</span>
            <div><strong>Public Observer</strong><small>Read-only access</small></div>
            <Link href="/login" className="ops-signout" title="Sign in as Operator" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#58A6FF" }}>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
      </aside>
      <div className="ops-shell-main">
        <header className="ops-topbar">
          <button type="button" className="ops-icon-menu" onClick={() => setMenu(!menu)} aria-label={menu ? "Close navigation" : "Open navigation"} aria-expanded={menu}>{menu ? <X size={15} /> : <Menu size={15} />}</button>
          <div className="ops-breadcrumb"><span className="ops-crumb-muted">Mission Control</span><ChevronRight className="ops-crumb-muted" size={10} /><span>Production</span><ChevronRight size={10} /><strong>{active.label}</strong></div>
          <form id="ops-search-form" method="GET" action="/dashboard/incidents" className={`ops-search ${searchOpen ? "is-open" : ""}`} role="search"><Search size={12} /><input ref={search} name="q" type="search" placeholder="Find an incident…" aria-label="Search incidents by reference, service or title" /><kbd>/</kbd></form>
          <div className="ops-topbar-actions">
            {!user && (
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#4F8CFF]/40 bg-[#4F8CFF]/15 px-2.5 py-1 text-[11px] font-semibold text-[#58A6FF] hover:bg-[#4F8CFF]/25 hover:text-white transition-colors"
              >
                Sign In as Operator
              </Link>
            )}
            <button type="button" className="ops-search-toggle" aria-label={searchOpen ? "Close search" : "Search incidents"} aria-controls="ops-search-form" aria-expanded={searchOpen} onClick={() => { const next = !searchOpen; setSearchOpen(next); if (next) window.requestAnimationFrame(() => search.current?.focus()); }}>{searchOpen ? <X size={15} /> : <Search size={15} />}</button>
            <button type="button" className="ops-refresh" title="Refresh workspace data" aria-label="Refresh workspace data" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw size={13} className={pending ? "sb-spinning" : ""} /></button>
          </div>
        </header>
        <main className="ops-page-content">
          {children}
        </main>
      </div>
      {menu && <button className="ops-mobile-backdrop" onClick={() => setMenu(false)} aria-label="Close navigation" />}
    </div>
  );
}
