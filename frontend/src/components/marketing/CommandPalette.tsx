"use client";

import { ArrowUpRight, BookOpen, CornerDownLeft, FileCode2, LayoutGrid, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import GitHubMark from "@/components/ui/GitHubMark";
import { DASHBOARD_HREF, DOCS_HREF, GITHUB_URL, sectionLinks } from "@/lib/site";

type Item = {
  id: string;
  label: string;
  group: "Jump to" | "Links";
  hint?: string;
  icon: ComponentType<{ size?: number }>;
  run: () => void;
};

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const items = useMemo<Item[]>(() => {
    const sections: Item[] = sectionLinks.map(section => ({
      id: section.id,
      label: section.label,
      group: "Jump to",
      hint: `#${section.id}`,
      icon: LayoutGrid,
      run: () => {
        const node = document.getElementById(section.id);
        node?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }));
    return [
      ...sections,
      { id: "docs", label: "Documentation", group: "Links", hint: "API reference", icon: BookOpen, run: () => router.push(DOCS_HREF) },
      { id: "dashboard", label: "Open dashboard", group: "Links", hint: "Operator console", icon: FileCode2, run: () => router.push(DASHBOARD_HREF) },
      { id: "github", label: "GitHub repository", group: "Links", hint: "Source code", icon: GitHubMark, run: () => window.open(GITHUB_URL, "_blank", "noreferrer") },
    ];
  }, [router]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter(item => `${item.label} ${item.group} ${item.hint ?? ""}`.toLowerCase().includes(term));
  }, [items, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const openPalette = useCallback(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close(); else openPalette();
      }
      if (event.key === "Escape" && open) close();
    };
    const onOpen = () => openPalette();
    window.addEventListener("keydown", onKey);
    window.addEventListener("sb:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sb:command", onOpen);
    };
  }, [open, close, openPalette]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previous;
      if (restoreRef.current?.isConnected) restoreRef.current.focus();
      else document.querySelector<HTMLButtonElement>(".lp-burger")?.focus();
    };
  }, [open]);

  const runItem = useCallback((item: Item | undefined) => {
    if (!item) return;
    close();
    window.setTimeout(() => item.run(), 80);
  }, [close]);

  if (!open) return null;

  return (
    <div className="cmdk-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="cmdk" onKeyDown={event => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input, button:not([disabled])'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <div className="cmdk-input">
          <Search size={15} aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="lp-command-list"
            aria-autocomplete="list"
            aria-activedescendant={filtered[active] ? `cmdk-option-${filtered[active].id}` : undefined}
            aria-label="Search sections and links"
            placeholder="Jump to a section or open a link…"
            value={query}
            onChange={event => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={event => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive(current => (filtered.length ? (current + 1) % filtered.length : 0)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive(current => (filtered.length ? (current - 1 + filtered.length) % filtered.length : 0)); }
              if (event.key === "Enter") { event.preventDefault(); runItem(filtered[active]); }

            }}
          />
          <button type="button" className="cmdk-close" onClick={close} aria-label="Close search"><kbd className="lp-kbd" aria-hidden="true">ESC</kbd><X size={14} aria-hidden="true" /></button>
        </div>
        <div id="lp-command-list" role="listbox" aria-label="Commands" className="cmdk-list">
          {filtered.length === 0 ? (
            <p className="cmdk-empty">No matches. Try &ldquo;pipeline&rdquo;, &ldquo;docs&rdquo; or &ldquo;dashboard&rdquo;.</p>
          ) : (
            filtered.map((item, index) => {
              const previous = filtered[index - 1];
              const showGroup = !previous || previous.group !== item.group;
              return (
                <div key={item.id} role="presentation">
                  {showGroup && <div className="cmdk-group" role="presentation">{item.group}</div>}
                  <button type="button" role="option" id={`cmdk-option-${item.id}`} aria-selected={index === active} className="cmdk-item" data-active={index === active} onMouseEnter={() => setActive(index)} onClick={() => runItem(item)}>
                    <item.icon size={14} />
                    <span>{item.label}</span>
                    {item.hint && <span className="lp-small" style={{ marginLeft: "auto" }}>{item.hint}</span>}
                    {index === active && <CornerDownLeft size={12} style={{ marginLeft: 10, opacity: 0.5 }} aria-hidden="true" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="cmdk-foot">
          <span><kbd className="lp-kbd">↑</kbd> <kbd className="lp-kbd">↓</kbd> navigate</span>
          <span><kbd className="lp-kbd">↵</kbd> open</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
            SignalBridge <ArrowUpRight size={10} aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}
