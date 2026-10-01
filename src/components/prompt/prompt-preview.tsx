"use client";

import { useMemo } from "react";
import { renderTemplate } from "@/lib/template";
import { cn } from "@/lib/utils";
import type { VariableDef } from "@/lib/types";

/** Live preview: filled values get a brand tint, unfilled values show as [Label] chips. */
export function PromptPreview({
  body, variables, values, className,
}: { body: string; variables: VariableDef[]; values: Record<string, string>; className?: string }) {
  const { segments, missing } = useMemo(() => renderTemplate(body, variables, values), [body, variables, values]);
  const missingLabels = missing.map((k) => variables.find((v) => v.key === k)?.label ?? k);
  return (
    <div className={cn("grid gap-2", className)}>
      <div
        data-testid="prompt-preview"
        role="region"
        aria-label="Prompt preview"
        className="max-h-[28rem] overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
      >
        {segments.map((s, i) => {
          if (s.kind === "text") return <span key={i}>{s.text}</span>;
          return s.filled ? (
            <mark key={i} data-filled="true" className="rounded bg-primary/15 px-0.5 text-foreground">{s.text}</mark>
          ) : (
            <span key={i} data-unfilled="true"
              className="mx-0.5 rounded border border-dashed border-primary/50 bg-background px-1 text-xs font-medium text-primary">
              {s.text}
            </span>
          );
        })}
      </div>
      {missingLabels.length > 0 ? (
        <p data-testid="missing-hint" className="text-xs text-muted-foreground">
          Still to fill in: {missingLabels.join(", ")}. You can copy anyway.
        </p>
      ) : null}
    </div>
  );
}
