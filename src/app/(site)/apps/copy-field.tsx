"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the value is still selectable in the field.
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <code
        aria-label={label}
        tabIndex={0}
        className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted px-3 py-2 font-mono text-sm"
      >
        {value}
      </code>
      <Button type="button" variant="outline" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? <Check /> : <Copy />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}
