"use client";
import { AI_MODELS } from "@/lib/constants";
import { MODEL_TARGETS } from "@/lib/models";
import type { AiModel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_MODELS } from "./helpers";

export interface ModelSelectProps {
  value: AiModel[];
  onChange: (next: AiModel[]) => void;
  max?: number;
  labelledBy?: string;
}

/** Multi-select of target models as toggle chips. Empty means "works with any model". */
export function ModelSelect({ value, onChange, max = MAX_MODELS, labelledBy }: ModelSelectProps) {
  const full = value.length >= max;
  function toggle(m: AiModel) {
    if (value.includes(m)) onChange(value.filter((x) => x !== m));
    else if (!full) onChange([...value, m]);
  }
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {AI_MODELS.map((m) => {
        const on = value.includes(m);
        const disabled = !on && full;
        return (
          <button
            key={m} type="button" aria-pressed={on} disabled={disabled} onClick={() => toggle(m)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {MODEL_TARGETS[m].name}
          </button>
        );
      })}
    </div>
  );
}
