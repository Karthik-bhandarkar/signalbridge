import Link from "next/link";

export function BridgeGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 19.5V12a8.5 8.5 0 0 1 17 0v7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 19.5V12a4 4 0 0 1 8 0v7.5M3.5 15.5h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="lp-logo" aria-label="SignalBridge home">
      <span className="lp-logo-mark">
        <BridgeGlyph size={16} />
      </span>
      SignalBridge
    </Link>
  );
}
