"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, User, Copy, Check, ArrowRight, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";
import { DEMO_CREDENTIALS } from "@/lib/constants";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function handleCopy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  }

  async function handleLogin(uName: string, pWord: string) {
    setLoading(true);
    setError(null);

    try {
      // 1. Establish Next.js session first
      const formData = new FormData();
      formData.append("username", uName);
      formData.append("password", pWord);

      const actionRes = await fetch("/api/auth/session-login", {
        method: "POST",
        body: formData,
      });

      if (!actionRes.ok) {
        const data = await actionRes.json().catch(() => ({}));
        throw new Error(data.error || "Invalid username or password.");
      }

      // 2. Best-effort Django session sync (if available)
      try {
        let csrfToken = "";
        const csrfRes = await fetch("/api/v1/auth/csrf/");
        if (csrfRes.ok) {
          const csrfData = await csrfRes.json();
          csrfToken = csrfData.csrfToken || "";
        }
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (csrfToken) headers["X-CSRFToken"] = csrfToken;

        await fetch("/api/v1/auth/login/", {
          method: "POST",
          headers,
          body: JSON.stringify({ username: uName, password: pWord }),
        });
      } catch {
        // Ignore backend sync failure in standalone/mock modes
      }

      // 3. Navigate directly to dashboard
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid username or password.";
      setError(msg);
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleLogin(username, password);
  }

  return (
    <div className="space-y-6">
      {/* Primary Authentication Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-[#F85149]/40 bg-[#F85149]/10 px-3.5 py-2.5 text-xs text-[#F85149] animate-in fade-in duration-150">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Username Field */}
        <div>
          <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-[#8B949E] mb-1.5">
            Username
          </label>
          <div className="relative">
            <User size={14} className="absolute left-3 top-3 text-[#8B949E]" />
            <input
              type="text"
              autoComplete="username"
              required
              placeholder="operator ID"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-[#232C3D] bg-[#0A0E14] pl-9 pr-3.5 py-2 text-sm text-[#E6EAF2] placeholder-[#8B949E] focus:border-[#4F8CFF] focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Password Field with Show/Hide Toggle */}
        <div>
          <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-[#8B949E] mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-3 text-[#8B949E]" />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[#232C3D] bg-[#0A0E14] pl-9 pr-10 py-2 text-sm text-[#E6EAF2] placeholder-[#8B949E] focus:border-[#4F8CFF] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-[#8B949E] hover:text-[#E6EAF2] transition-colors p-0.5"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Sign In Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#4F8CFF] py-2.5 text-xs font-semibold text-white hover:bg-[#4F8CFF]/90 transition-all shadow-md shadow-[#4F8CFF]/20 disabled:opacity-50"
        >
          {loading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Authenticating Session...</span>
            </>
          ) : (
            <>
              <span>Sign In to Mission Control</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </form>

      {/* Demo Access Card */}
      <div className="rounded-2xl border border-[#232C3D] bg-[#0A0E14] p-4.5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between border-b border-[#232C3D] pb-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#4F8CFF]" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#E6EAF2]">
              Demo Access
            </h3>
          </div>
          <span className="rounded-full bg-[#161D2B] border border-[#232C3D] px-2 py-0.5 font-mono text-[9px] text-[#8B949E]">
            PUBLIC EVALUATION
          </span>
        </div>

        <p className="text-[11px] text-[#8B949E] leading-relaxed">
          Evaluate full triage capabilities with seeded demo accounts. No setup required.
        </p>

        {/* Demo Operator */}
        <div className="rounded-xl border border-[#232C3D] bg-[#111722] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#E6EAF2]">
              {DEMO_CREDENTIALS.operator.name}
            </span>
            <span className="font-mono text-[9px] font-semibold text-[#4F8CFF] uppercase bg-[#4F8CFF]/10 border border-[#4F8CFF]/30 px-1.5 py-0.5 rounded">
              Triage & Simulator
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            {/* Username */}
            <div className="flex items-center justify-between rounded-lg bg-[#0A0E14] px-2 py-1 border border-[#232C3D]">
              <span className="text-[#8B949E] truncate">{DEMO_CREDENTIALS.operator.username}</span>
              <button
                type="button"
                onClick={() => handleCopy(DEMO_CREDENTIALS.operator.username, "op_u")}
                className="text-[#8B949E] hover:text-[#E6EAF2] p-0.5"
                title="Copy username"
              >
                {copiedKey === "op_u" ? <Check size={11} className="text-[#3FB950]" /> : <Copy size={11} />}
              </button>
            </div>

            {/* Password */}
            <div className="flex items-center justify-between rounded-lg bg-[#0A0E14] px-2 py-1 border border-[#232C3D]">
              <span className="text-[#8B949E] truncate">••••••••••••</span>
              <button
                type="button"
                onClick={() => handleCopy(DEMO_CREDENTIALS.operator.password, "op_p")}
                className="text-[#8B949E] hover:text-[#E6EAF2] p-0.5"
                title="Copy password"
              >
                {copiedKey === "op_p" ? <Check size={11} className="text-[#3FB950]" /> : <Copy size={11} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setUsername(DEMO_CREDENTIALS.operator.username);
              setPassword(DEMO_CREDENTIALS.operator.password);
              handleLogin(DEMO_CREDENTIALS.operator.username, DEMO_CREDENTIALS.operator.password);
            }}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#4F8CFF]/40 bg-[#4F8CFF]/15 py-1.5 text-xs font-semibold text-[#58A6FF] hover:bg-[#4F8CFF]/25 transition-all"
          >
            <span>Fill & Sign In as Demo Operator</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Demo Viewer */}
        <div className="rounded-xl border border-[#232C3D] bg-[#111722] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#E6EAF2]">
              {DEMO_CREDENTIALS.viewer.name}
            </span>
            <span className="font-mono text-[9px] font-semibold text-[#8B949E] uppercase bg-[#161D2B] border border-[#232C3D] px-1.5 py-0.5 rounded">
              Read-Only
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            {/* Username */}
            <div className="flex items-center justify-between rounded-lg bg-[#0A0E14] px-2 py-1 border border-[#232C3D]">
              <span className="text-[#8B949E] truncate">{DEMO_CREDENTIALS.viewer.username}</span>
              <button
                type="button"
                onClick={() => handleCopy(DEMO_CREDENTIALS.viewer.username, "vi_u")}
                className="text-[#8B949E] hover:text-[#E6EAF2] p-0.5"
                title="Copy username"
              >
                {copiedKey === "vi_u" ? <Check size={11} className="text-[#3FB950]" /> : <Copy size={11} />}
              </button>
            </div>

            {/* Password */}
            <div className="flex items-center justify-between rounded-lg bg-[#0A0E14] px-2 py-1 border border-[#232C3D]">
              <span className="text-[#8B949E] truncate">••••••••••••</span>
              <button
                type="button"
                onClick={() => handleCopy(DEMO_CREDENTIALS.viewer.password, "vi_p")}
                className="text-[#8B949E] hover:text-[#E6EAF2] p-0.5"
                title="Copy password"
              >
                {copiedKey === "vi_p" ? <Check size={11} className="text-[#3FB950]" /> : <Copy size={11} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setUsername(DEMO_CREDENTIALS.viewer.username);
              setPassword(DEMO_CREDENTIALS.viewer.password);
              handleLogin(DEMO_CREDENTIALS.viewer.username, DEMO_CREDENTIALS.viewer.password);
            }}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#232C3D] bg-[#161D2B] py-1.5 text-xs font-semibold text-[#8B949E] hover:text-[#E6EAF2] hover:bg-[#232C3D]/60 transition-all"
          >
            <span>Fill & Sign In as Demo Viewer</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
