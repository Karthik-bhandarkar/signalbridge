"use client";

import { useState } from "react";
import { Lock, X, AlertCircle, Shield, ArrowRight, RefreshCw } from "lucide-react";

interface OperatorLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: { username: string; role: string }) => void;
}

export default function OperatorLoginModal({ isOpen, onClose, onSuccess }: OperatorLoginModalProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function performLogin(uName: string, pWord: string) {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch CSRF token if available
      let csrfToken = "";
      try {
        const csrfRes = await fetch("/api/v1/auth/csrf/");
        if (csrfRes.ok) {
          const csrfData = await csrfRes.json();
          csrfToken = csrfData.csrfToken || "";
        }
      } catch {
        // Ignore if CSRF route unreachable directly
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) headers["X-CSRFToken"] = csrfToken;

      const res = await fetch("/api/v1/auth/login/", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: uName, password: pWord }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Authentication failed. Check credentials.");
      }

      const userRes = await fetch("/api/v1/auth/me/").catch(() => null);
      let userData = { username: uName, role: "Operator" };
      if (userRes && userRes.ok) {
        const data = await userRes.json();
        userData = { username: data.username || uName, role: data.role || "Operator" };
      }

      onSuccess(userData);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    performLogin(username, password);
  }

  function handleQuickDemoLogin() {
    setUsername("admin");
    setPassword("admin123");
    performLogin("admin", "admin123");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl border border-[#232C3D] bg-[#111722] p-6 shadow-2xl relative"
        style={{ color: "#E6EAF2" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8B949E] hover:text-[#E6EAF2] transition-colors p-1 rounded-lg"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 text-[#4F8CFF]">
            <Shield size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#E6EAF2]">Operator Authentication</h2>
            <p className="text-xs text-[#8B949E]">Mission Control Perimeter B Access</p>
          </div>
        </div>

        <p className="text-xs text-[#8B949E] leading-relaxed mb-5">
          Triage actions (Acknowledge, Resolve) and live pipeline simulation require authenticated operator privileges.
        </p>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#F85149]/30 bg-[#F85149]/10 px-3 py-2 text-xs text-[#F85149]">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-[#8B949E] mb-1">
              Username / Operator ID
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-[#232C3D] bg-[#0A0E14] px-3 py-2 text-sm text-[#E6EAF2] placeholder-[#8B949E] focus:border-[#4F8CFF] focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-[#8B949E] mb-1">
              Secret Passkey
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#232C3D] bg-[#0A0E14] px-3 py-2 text-sm text-[#E6EAF2] placeholder-[#8B949E] focus:border-[#4F8CFF] focus:outline-none"
              required
            />
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#4F8CFF] py-2.5 text-xs font-semibold text-white hover:bg-[#4F8CFF]/90 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Authenticating Session...</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Authenticate Operator Session</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleQuickDemoLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#232C3D] bg-[#161D2B] py-2.5 text-xs font-semibold text-[#4F8CFF] hover:bg-[#4F8CFF]/10 hover:border-[#4F8CFF]/50 transition-all"
            >
              <span>⚡ 1-Click Demo Operator Sign In (Instant Access)</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
