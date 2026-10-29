"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, User, Copy, Check, ArrowRight, ShieldCheck, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { PUBLIC_DEMO_ACCOUNTS } from "@/lib/constants";
import { apiClient, ApiError } from "@/lib/api";

interface LoginFormProps {
  onSuccess?: (user: any) => void;
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("Admin");
  const [password, setPassword] = useState("Admin@123");
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
      // Ignore clipboard failure
    }
  }

  async function performLogin(uName: string, pWord: string) {
    if (!uName || !pWord) {
      setError("Please provide both username and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const loginRes = await apiClient.auth.login(uName, pWord);
      const user = loginRes.user;

      if (onSuccess) {
        onSuccess(user);
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Invalid credentials. Please verify your username and password.");
        } else if (err.status === 429) {
          setError("Too many login attempts. Please wait 1 minute before retrying.");
        } else {
          setError(err.message || "Authentication failed. Check your network connection.");
        }
      } else {
        setError(err instanceof Error ? err.message : "Authentication error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    performLogin(username, password);
  }

  function handleQuickFillAndSignIn(demoAccount: { username: string; password: string }) {
    setUsername(demoAccount.username);
    setPassword(demoAccount.password);
    performLogin(demoAccount.username, demoAccount.password);
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
            Username / Operator ID
          </label>
          <div className="relative">
            <User size={14} className="absolute left-3 top-3 text-[#8B949E]" />
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Admin"
              autoComplete="username"
              required
              className="w-full rounded-xl border border-[#232C3D] bg-[#161D2B] pl-9 pr-3.5 py-2.5 text-sm text-[#E6EAF2] placeholder-[#8B949E]/50 focus:border-[#4F8CFF] focus:outline-none focus:ring-1 focus:ring-[#4F8CFF] transition-all"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-[#8B949E] mb-1.5">
            Secret Passkey
          </label>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-3 text-[#8B949E]" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Admin@123"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-[#232C3D] bg-[#161D2B] pl-9 pr-10 py-2.5 text-sm text-[#E6EAF2] placeholder-[#8B949E]/50 focus:border-[#4F8CFF] focus:outline-none focus:ring-1 focus:ring-[#4F8CFF] transition-all font-mono"
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

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#4F8CFF] py-2.5 text-xs font-semibold text-white hover:bg-[#4F8CFF]/90 transition-all disabled:opacity-50 shadow-md shadow-[#4F8CFF]/20 active:scale-[0.99] cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Verifying Operator Credentials...</span>
            </>
          ) : (
            <>
              <ShieldCheck size={14} />
              <span>Authenticate Operator Session</span>
            </>
          )}
        </button>
      </form>

      {/* Demo Credentials Card */}
      <div className="rounded-2xl border border-[#232C3D] bg-[#161D2B]/70 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#E6EAF2]">
          <Sparkles size={14} className="text-[#F0B232]" />
          <span>Quick Authentication (Instant One-Click Sign In)</span>
        </div>
        <p className="text-[11px] text-[#8B949E] leading-relaxed">
          Select an authorized role below for instant evaluation. Credentials are pre-configured with active session permissions.
        </p>

        <div className="space-y-2.5 pt-1">
          {/* Admin Account */}
          <div className="rounded-xl border border-[#4F8CFF]/40 bg-[#111722] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#4F8CFF]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4F8CFF]" />
                {PUBLIC_DEMO_ACCOUNTS.admin.label}
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#4F8CFF]/15 text-[#4F8CFF] border border-[#4F8CFF]/30">
                Full Admin Privileges
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="flex items-center justify-between bg-[#161D2B] px-2.5 py-1.5 rounded-lg border border-[#232C3D]">
                <span className="text-[#E6EAF2] truncate mr-1 font-semibold">{PUBLIC_DEMO_ACCOUNTS.admin.username}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(PUBLIC_DEMO_ACCOUNTS.admin.username, "admin_user")}
                  className="text-[#8B949E] hover:text-[#E6EAF2] transition-colors shrink-0"
                  title="Copy username"
                >
                  {copiedKey === "admin_user" ? <Check size={12} className="text-[#3FB950]" /> : <Copy size={12} />}
                </button>
              </div>

              <div className="flex items-center justify-between bg-[#161D2B] px-2.5 py-1.5 rounded-lg border border-[#232C3D]">
                <span className="text-[#E6EAF2] truncate mr-1 font-semibold">{PUBLIC_DEMO_ACCOUNTS.admin.password}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(PUBLIC_DEMO_ACCOUNTS.admin.password, "admin_pw")}
                  className="text-[#8B949E] hover:text-[#E6EAF2] transition-colors shrink-0"
                  title="Copy passkey"
                >
                  {copiedKey === "admin_pw" ? <Check size={12} className="text-[#3FB950]" /> : <Copy size={12} />}
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickFillAndSignIn(PUBLIC_DEMO_ACCOUNTS.admin)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#4F8CFF] py-2 text-xs font-semibold text-white hover:bg-[#4F8CFF]/90 transition-all cursor-pointer shadow-md shadow-[#4F8CFF]/25"
            >
              <span>1-Click Sign In as Admin (Admin / Admin@123)</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Demo Operator */}
          <div className="rounded-xl border border-[#232C3D] bg-[#111722] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#8B949E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8B949E]" />
                {PUBLIC_DEMO_ACCOUNTS.operator.label}
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#8B949E]/10 text-[#8B949E] border border-[#8B949E]/20">
                Triage Operator
              </span>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickFillAndSignIn(PUBLIC_DEMO_ACCOUNTS.operator)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#232C3D] py-1.5 text-xs font-medium text-[#E6EAF2] hover:bg-[#2A354A] transition-all cursor-pointer"
            >
              <span>1-Click Sign In as Demo Operator</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Demo Viewer */}
          <div className="rounded-xl border border-[#232C3D] bg-[#111722] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#8B949E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8B949E]" />
                {PUBLIC_DEMO_ACCOUNTS.viewer.label}
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#8B949E]/10 text-[#8B949E] border border-[#8B949E]/20">
                Read-Only Observer
              </span>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickFillAndSignIn(PUBLIC_DEMO_ACCOUNTS.viewer)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#232C3D] py-1.5 text-xs font-medium text-[#E6EAF2] hover:bg-[#2A354A] transition-all cursor-pointer"
            >
              <span>1-Click Sign In as Demo Viewer</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
