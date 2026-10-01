"use client";

import { useId } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { VariableDef } from "@/lib/types";

const selectCls =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Field({
  def, value, onChange, idBase,
}: { def: VariableDef; value: string; onChange: (v: string) => void; idBase: string }) {
  const id = `${idBase}-${def.key}`;
  const helpId = def.help ? `${id}-help` : undefined;
  const common = { id, "aria-describedby": helpId, "aria-required": def.required || undefined, name: def.key } as const;
  const placeholder = def.default ?? undefined;

  let control;
  if (def.type === "long") {
    control = (
      <Textarea {...common} value={value} rows={3} placeholder={placeholder} className="max-h-64 min-h-20"
        onChange={(e) => onChange(e.target.value)} />
    );
  } else if (def.type === "select") {
    control = (
      <select {...common} value={value} className={selectCls} onChange={(e) => onChange(e.target.value)}>
        <option value="">{def.default ? `Default (${def.default})` : "Choose…"}</option>
        {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (def.type === "number") {
    control = (
      <Input {...common} type="number" inputMode="decimal" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    );
  } else {
    control = (
      <Input {...common} type="text" value={value} placeholder={placeholder} autoComplete="off"
        onChange={(e) => onChange(e.target.value)} />
    );
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {def.label}
        {def.required ? <span aria-hidden="true" className="text-destructive">*</span> : null}
        {def.required ? <span className="sr-only">(required)</span> : null}
      </Label>
      {control}
      {def.help ? <p id={helpId} className="text-xs text-muted-foreground">{def.help}</p> : null}
    </div>
  );
}

/** Controlled fill-in form generated from a prompt's VariableDefs. */
export function VariableForm({
  variables, values, onChange, onReset, className,
}: {
  variables: VariableDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
  className?: string;
}) {
  const idBase = useId();
  if (variables.length === 0) return null;
  return (
    <form className={cn("grid gap-3", className)} aria-label="Fill in the prompt" onSubmit={(e) => e.preventDefault()}>
      {variables.map((def) => (
        <Field key={def.key} def={def} idBase={idBase} value={values[def.key] ?? ""} onChange={(v) => onChange(def.key, v)} />
      ))}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Saved in this browser only.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset
        </Button>
      </div>
    </form>
  );
}
