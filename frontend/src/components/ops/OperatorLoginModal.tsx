"use client";

import { useEffect } from "react";
import { X, Shield } from "lucide-react";
import LoginForm from "./LoginForm";

interface OperatorLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: { username: string; role: string }) => void;
}

export default function OperatorLoginModal({ isOpen, onClose, onSuccess }: OperatorLoginModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-3xl border border-[#232C3D] bg-[#111722] p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        style={{ color: "#E6EAF2" }}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[#8B949E] hover:text-[#E6EAF2] transition-colors p-1.5 rounded-lg hover:bg-[#161D2B]"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <div className="mb-5 border-b border-[#232C3D] pb-4">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#4F8CFF] mb-1">
            <Shield size={14} />
            <span>Mission Control Perimeter Access</span>
          </div>
          <h2 className="text-lg font-bold text-[#E6EAF2]">Operator Authentication</h2>
          <p className="text-xs text-[#8B949E] mt-0.5">
            Triage actions and live pipeline simulation require authenticated operator privileges.
          </p>
        </div>

        <LoginForm
          onSuccess={(user) => {
            onSuccess?.(user);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
