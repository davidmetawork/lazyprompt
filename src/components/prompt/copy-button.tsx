"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "./clipboard";

export function CopyButton({
  text, onCopied, label = "Copy", className,
}: { text: string; onCopied?: () => void; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyText(text);
    if (!ok) {
      toast.error("Could not copy. Select the preview text and copy it manually.");
      return;
    }
    toast.success("Copied");
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 2000);
    onCopied?.();
  }

  return (
    <Button type="button" size="lg" className={className} onClick={onClick}>
      {done ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {done ? "Copied" : label}
    </Button>
  );
}
