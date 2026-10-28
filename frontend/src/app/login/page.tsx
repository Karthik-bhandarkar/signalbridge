import Link from "next/link";
import { ArrowLeft, ExternalLink, Shield } from "lucide-react";
import Brand from "@/components/ui/Brand";
import LoginForm from "@/components/ops/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main
      className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: "#0A0E14", color: "#E6EAF2" }}
    >
      <div className="w-full max-w-md space-y-6">
        {/* Header with Brand Logo & Tagline */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Link href="/" aria-label="SignalBridge home">
              <Brand />
            </Link>
          </div>
          <p className="text-xs text-[#8B949E]">
            High-Throughput Webhook Ingestion & Automated Incident Triage
          </p>
        </div>

        {/* Primary Auth Card Container */}
        <div className="rounded-3xl border border-[#232C3D] bg-[#111722] p-6 sm:p-7 shadow-2xl">
          <div className="mb-5 border-b border-[#232C3D] pb-4">
            <h1 className="text-lg font-bold text-[#E6EAF2]">Mission Control Sign In</h1>
            <p className="text-xs text-[#8B949E] mt-0.5">
              Enter your operator credentials or select demo access below.
            </p>
          </div>

          <LoginForm />
        </div>

        {/* Public Status Page & Back Links */}
        <div className="flex items-center justify-between text-xs text-[#8B949E] px-2 font-mono">
          <Link
            href="/"
            className="flex items-center gap-1.5 hover:text-[#E6EAF2] transition-colors"
          >
            <ArrowLeft size={12} />
            <span>Back to Product</span>
          </Link>

          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-[#4F8CFF] hover:underline transition-colors"
          >
            <span>View Public Status Page</span>
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </main>
  );
}
