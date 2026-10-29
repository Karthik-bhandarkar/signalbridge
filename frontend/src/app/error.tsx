"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log non-sensitive error metadata
    console.error("SignalBridge UI Exception caught by ErrorBoundary:", error.message);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full rounded-2xl border border-[#232C3D] bg-[#111722] p-8 shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F85149]/15 text-[#F85149] mb-4">
          <AlertCircle size={24} />
        </div>
        <h2 className="text-lg font-bold text-[#E6EAF2]">Operational Gateway Error</h2>
        <p className="mt-2 text-xs text-[#8B949E]">
          An unexpected error occurred while loading this view. The telemetry pipeline and background workers remain operational.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 font-mono text-xs">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 rounded-lg bg-[#4F8CFF] px-4 py-2 font-semibold text-white hover:bg-[#3B72E2] transition-colors w-full sm:w-auto justify-center"
          >
            <RefreshCw size={13} />
            <span>Try Again</span>
          </button>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg border border-[#232C3D] bg-[#161D2B] px-4 py-2 font-semibold text-[#8B949E] hover:text-[#E6EAF2] hover:bg-[#232C3D] transition-colors w-full sm:w-auto justify-center"
          >
            <Home size={13} />
            <span>Overview</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

