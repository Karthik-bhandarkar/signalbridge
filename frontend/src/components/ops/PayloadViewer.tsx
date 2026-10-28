"use client";

import { Check, Copy, Download, FileJson, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/controls";

export default function PayloadViewer({ payload, label = "payload" }: { payload: unknown; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(payload, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "signalbridge-payload.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leadingIcon={<FileJson size={12} aria-hidden="true" />}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </Button>
      <dialog
        ref={dialog}
        className="ops-payload-dialog"
        aria-labelledby={titleId}
        onClick={event => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="ops-payload-dialog-inner">
          <header>
            <div><FileJson size={16} aria-hidden="true" /><span id={titleId}>Original webhook payload</span></div>
            <IconButton label="Close payload" variant="quiet" size="sm" onClick={() => dialog.current?.close()}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          </header>
          <p>Exact JSON content retained with this delivery.</p>
          <pre className="ops-scroll" tabIndex={0}><code>{text}</code></pre>
          <footer>
            <span>application/json · {new TextEncoder().encode(text).length.toLocaleString("en-US")} bytes formatted</span>
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} leadingIcon={copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}>
                {copied ? "Copied" : "Copy JSON"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={download} leadingIcon={<Download size={12} aria-hidden="true" />}>
                Download
              </Button>
            </div>
          </footer>
        </div>
      </dialog>
    </>
  );
}
