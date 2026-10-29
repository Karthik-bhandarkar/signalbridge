"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, User, Copy, Check, ArrowRight, ShieldCheck, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { PUBLIC_DEMO_ACCOUNTS } from "@/lib/constants";
import { useAuth } from "@/lib/AuthContext";
import { ApiError } from "@/lib/api";

interface LoginFormProps {
  onSuccess?: (user: any) => void;
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();
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
    const finalUser = uName.trim() || "Admin";
    const finalPass = pWord || "Admin@123";

    setLoading(true);
    setError(null);

    try {
      const user = await login(finalUser, finalPass);
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
    <div className="space-y-5">
      {/* Top Instant 1-Click Action */}
      <div className="space-y-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => performLogin(username || "Admin", password || "Admin@123")}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#4F8CFF] py-3 px-4 text-sm font-bold text-white hover:bg-[#4F8CFF]/90 transition-all shadow-lg shadow-[#4F8CFF]/25 active:scale-[0.99] cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              <span>Authenticating Session...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} className="text-[#F0B232]" />
              <span>⚡ 1-Click Instant Login (No Typing Needed)</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-[#232C3D]"></div>
          <span className="flex-shrink mx-2 text-[10px] font-mono uppercase tracking-wider text-[#8B949E]">
            Pre-Filled Credentials Below
          </span>
          <div className="flex-grow border-t border-[#232C3D]"></div>
        </div>
      </div>

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
              className="w-full rounded-xl border border-[#232C3D] bg-[#161D2B] pl-9 pr-3.5 py-2.5 text-sm text-[#E6EAF2] placeholder-[#8B949E]/50 focus:border-[#4F8CFF] focus:outline-none focus:ring-1 focus:ring-[#4F8CFF] transition-all font-mono"
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
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#232C3D] py-2.5 text-xs font-semibold text-[#E6EAF2] hover:bg-[#2A354A] transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Verifying Credentials...</span>
            </>
          ) : (
            <>
              <ShieldCheck size={14} />
              <span>Sign In with Username & Password</span>
            </>
          )}
        </button>
      </form>

      {/* Quick Role Selection Cards */}
      <div className="rounded-2xl border border-[#232C3D] bg-[#161D2B]/70 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#E6EAF2]">
          <Sparkles size={14} className="text-[#F0B232]" />
          <span>Switch Account / Public Roles</span>
        </div>

        <div className="space-y-2 pt-1">
          {/* Admin Account */}
          <div className="rounded-xl border border-[#4F8CFF]/40 bg-[#111722] p-2.5 flex items-center justify-between gap-2">
            <div>
              <span className="font-mono text-xs font-bold text-[#4F8CFF] block">
                {PUBLIC_DEMO_ACCOUNTS.admin.username} / {PUBLIC_DEMO_ACCOUNTS.admin.password}
              </span>
              <span className="text-[10px] text-[#8B949E]">Full Admin & Triage Privileges</span>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickFillAndSignIn(PUBLIC_DEMO_ACCOUNTS.admin)}
              aria-label="1-Click Sign In as Admin"
              className="shrink-0 flex items-center gap-1 rounded-lg bg-[#4F8CFF] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#4F8CFF]/90 transition-all cursor-pointer"
            >
              <span>Login</span>
              <ArrowRight size={11} />
            </button>
          </div>

          {/* Demo Operator */}
          <div className="rounded-xl border border-[#232C3D] bg-[#111722] p-2.5 flex items-center justify-between gap-2">
            <div>
              <span className="font-mono text-xs font-bold text-[#8B949E] block">
                {PUBLIC_DEMO_ACCOUNTS.operator.username}
              </span>
              <span className="text-[10px] text-[#8B949E]">Operator Triage & Simulator</span>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickFillAndSignIn(PUBLIC_DEMO_ACCOUNTS.operator)}
              aria-label="1-Click Sign In as Demo Operator"
              className="shrink-0 flex items-center gap-1 rounded-lg bg-[#232C3D] px-2.5 py-1.5 text-[11px] font-semibold text-[#E6EAF2] hover:bg-[#2A354A] transition-all cursor-pointer"
            >
              <span>1-Click Sign In as Demo Operator</span>
              <ArrowRight size={11} />
            </button>
          </div>

          {/* Demo Viewer */}
          <div className="rounded-xl border border-[#232C3D] bg-[#111722] p-2.5 flex items-center justify-between gap-2">
            <div>
              <span className="font-mono text-xs font-bold text-[#8B949E] block">
                {PUBLIC_DEMO_ACCOUNTS.viewer.username}
              </span>
              <span className="text-[10px] text-[#8B949E]">Read-Only Incident Observer</span>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickFillAndSignIn(PUBLIC_DEMO_ACCOUNTS.viewer)}
              aria-label="1-Click Sign In as Demo Viewer"
              className="shrink-0 flex items-center gap-1 rounded-lg bg-[#232C3D] px-2.5 py-1.5 text-[11px] font-semibold text-[#E6EAF2] hover:bg-[#2A354A] transition-all cursor-pointer"
            >
              <span>Login</span>
              <ArrowRight size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
