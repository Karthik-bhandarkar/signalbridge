"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SignalBridge Root Application Exception:", error.message);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#0A0E14] text-[#E6EAF2] min-h-screen flex items-center justify-center p-6 antialiased font-sans">
        <div className="max-w-md w-full rounded-2xl border border-[#232C3D] bg-[#111722] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F85149]/15 text-[#F85149] mb-4">
            <AlertTriangle size={28} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#E6EAF2]">Application Fault</h1>
          <p className="mt-2 text-xs text-[#8B949E] leading-relaxed">
            The core rendering pipeline encountered a critical condition. Please reload the console.
          </p>
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => reset()}
              className="flex items-center gap-2 rounded-lg bg-[#4F8CFF] px-5 py-2.5 font-mono text-xs font-semibold text-white hover:bg-[#3B72E2] transition-colors"
            >
              <RefreshCw size={14} />
              <span>Reload Console</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

