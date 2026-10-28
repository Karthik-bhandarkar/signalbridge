import type { CSSProperties } from "react";

export function BridgeMark({ size = 27, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M4 25V15C4 8.925 8.925 4 15 4h2c6.075 0 11 4.925 11 11v10" stroke="currentColor" strokeWidth="3" />
      <path d="M10 25V15a6 6 0 0 1 12 0v10M4 20h24" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

export default function Brand({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <span className={`sb-brand ${className}`} style={style}>
      <BridgeMark />
      <span>signalbridge<span className="sb-brand-period">.</span></span>
    </span>
  );
}
