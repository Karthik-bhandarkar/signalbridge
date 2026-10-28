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

export default function Shell({ children, user, openIncidents, critical }: { children: ReactNode; user: { name: string; email: string; role: string }; openIncidents: number; critical: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const search = useRef<HTMLInputElement>(null);
  const active = [...nav].reverse().find(item => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))) ?? nav[0];
  const initials = user.name.split(" ").map(part => part[0]).slice(0, 2).join("");

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
        <div className="ops-workspace-select"><span className="ops-workspace-icon"><Command size={16} /></span><div><strong>Demo workspace</strong><small>Production signals · demo data</small></div></div>
        <nav className="ops-nav" aria-label="Workspace navigation">
          <p className="ops-nav-label">Workspace</p>
          {nav.map(item => <Link href={item.href} key={item.href} className={`ops-nav-link ${item.href === active.href ? "active" : ""}`} onClick={() => setMenu(false)} aria-current={item.href === active.href ? "page" : undefined}><item.icon />{item.label}{item.href === "/dashboard/incidents" && openIncidents > 0 && <span className="ops-nav-count">{openIncidents}</span>}</Link>)}
          <p className="ops-nav-label" style={{ marginTop: 29 }}>Resources</p>
          <Link href="/docs" className="ops-nav-link"><BookOpen />API documentation<ArrowUpRight size={12} style={{ marginLeft: "auto" }} /></Link>
          <Link href="/" className="ops-nav-link"><ArrowUpRight />Back to product</Link>
        </nav>
        <div className="ops-sidebar-spacer" />
        <div className="ops-sidebar-status"><span><i className="sb-status-dot" />Signed webhook pipeline</span><p>Inline processing · PostgreSQL<br />Refresh for the latest state.</p></div>
        <div className="ops-user"><span className="ops-avatar">{initials}</span><div><strong>{user.name}</strong><small>{user.role.replace(/-/g, " ")}</small></div><form action={logoutAction}><button className="ops-signout" type="submit" aria-label="Sign out" title="Sign out"><LogOut size={14} /></button></form></div>
      </aside>
      <div className="ops-shell-main">
        <header className="ops-topbar">
          <button type="button" className="ops-icon-menu" onClick={() => setMenu(!menu)} aria-label={menu ? "Close navigation" : "Open navigation"} aria-expanded={menu}>{menu ? <X size={15} /> : <Menu size={15} />}</button>
          <div className="ops-breadcrumb"><span className="ops-crumb-muted">Workspace</span><ChevronRight className="ops-crumb-muted" size={10} /><span>Production</span><ChevronRight size={10} /><strong>{active.label}</strong></div>
          <form id="ops-search-form" method="GET" action="/dashboard/incidents" className={`ops-search ${searchOpen ? "is-open" : ""}`} role="search"><Search size={12} /><input ref={search} name="q" type="search" placeholder="Find an incident…" aria-label="Search incidents by reference, service or title" /><kbd>/</kbd></form>
          <div className="ops-topbar-actions">
            <button type="button" className="ops-search-toggle" aria-label={searchOpen ? "Close search" : "Search incidents"} aria-controls="ops-search-form" aria-expanded={searchOpen} onClick={() => { const next = !searchOpen; setSearchOpen(next); if (next) window.requestAnimationFrame(() => search.current?.focus()); }}>{searchOpen ? <X size={15} /> : <Search size={15} />}</button>
            <button type="button" className="ops-refresh" title="Refresh workspace data" aria-label="Refresh workspace data" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw size={13} className={pending ? "sb-spinning" : ""} /></button>
            <form action={simulateTrafficAction}><input type="hidden" name="count" value="8" /><SubmitButton pendingLabel="Processing…" showPlus>Simulate traffic</SubmitButton></form>
          </div>
        </header>
        <main className="ops-page-content">
          <div className="ops-page-intro"><div><h1>{active.label === "Overview" ? "Operational overview" : pathname.includes("/incidents/") ? "Incident investigation" : active.label}</h1><p>{active.label === "Overview" ? "A clear view of your signals, services, and response." : active.label === "Incidents" ? "Connect the signals. Take the next step." : active.label === "Event stream" ? "Every delivery, with its full processing history." : "Sources, processing, and payload storage at a glance."}</p></div><span className="ops-page-intro-status" data-critical={critical > 0}><span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor" }} />{critical > 0 ? `${critical} critical to review` : "No unacknowledged critical"}</span></div>
          {children}
        </main>
      </div>
      {menu && <button className="ops-mobile-backdrop" onClick={() => setMenu(false)} aria-label="Close navigation" />}
    </div>
  );
}
