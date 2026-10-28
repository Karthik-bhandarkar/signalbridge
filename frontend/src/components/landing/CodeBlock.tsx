"use client";

import { Check, Code2, Copy } from "lucide-react";
import { useState } from "react";

export default function CodeBlock({code,caption}:{code:string;caption?:string}) {
  const [state,setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(code); setState("copied"); }
    catch { setState("failed"); }
    window.setTimeout(()=>setState("idle"),2200);
  }
  return <div className="sb-codeblock">
    <div className="sb-codeblock-top"><span><Code2 size={12} />{caption ?? "integration.sh"}</span><button type="button" onClick={()=>void copy()} aria-label="Copy code">{state === "copied" ? <Check size={10} /> : <Copy size={10} />}<span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select to copy" : "Copy"}</span></button></div>
    <pre tabIndex={0}><code>{code}</code></pre>
  </div>;
}
