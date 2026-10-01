"use client";
import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { createPromptAction, updatePromptAction, type PromptActionState } from "@/actions/prompts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { USE_CASES } from "@/lib/constants";
import { renderTemplate } from "@/lib/template";
import type { VariableDef } from "@/lib/types";
import { promptInputSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import {
  buildVariables, fieldMessages, friendlyFieldErrors, overridesFromDefs, promptFormDataToInput, promptValuesToFormData,
  USE_CASE_LABELS, type PromptFormValues, type VariableOverride,
} from "./helpers";
import { ModelSelect } from "./model-select";
import { NativeSelect } from "./native-select";
import { TagInput } from "./tag-input";
import { useActionFailure } from "./use-action-failure";

export interface PromptFormProps {
  mode: "create" | "edit";
  categories: { slug: string; name: string }[];
  initial?: Partial<PromptFormValues>;
  /** Edit mode only. */
  promptId?: string;
  slug?: string;
  /** Trust level 0 authors are told their prompt is reviewed first. */
  reviewNotice?: boolean;
  /** Set to null to disable tag autocomplete (tests). */
  suggestUrl?: string | null;
}

const EMPTY: PromptFormValues = {
  title: "", description: "", body: "", categorySlug: "", useCase: "generate", tags: [], models: [],
  license: "cc_by_4", exampleOutput: "", notes: "", changeNote: "", variables: [],
};

function Field({
  id, label, hint, errors, counter, children,
}: { id: string; label: string; hint?: string; errors?: string[]; counter?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {counter ? <span className="text-xs text-muted-foreground tabular-nums">{counter}</span> : null}
      </div>
      {children}
      {hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {errors && errors.length > 0 ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{errors.join(" ")}</p>
      ) : null}
    </div>
  );
}

export function PromptForm({ mode, categories, initial, promptId, slug, reviewNotice, suggestUrl }: PromptFormProps) {
  const uid = useId();
  const fail = useActionFailure();
  const [values, setValues] = useState<PromptFormValues>({ ...EMPTY, ...initial });
  const [overrides, setOverrides] = useState<Record<string, VariableOverride>>(() => overridesFromDefs(initial?.variables ?? []));
  const [clientErrors, setClientErrors] = useState<Record<string, string[]> | null>(null);
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState<PromptActionState, FormData>(
    mode === "edit" ? updatePromptAction : createPromptAction, null,
  );
  const alertRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dirtyRef = useRef(false);
  const draftKey = `draft:${slug ?? "new"}`;

  const built = useMemo(() => buildVariables(values.body, overrides), [values.body, overrides]);
  const preview = useMemo(
    () => renderTemplate(built.body, built.variables, {}, { unfilled: "label" }),
    [built.body, built.variables],
  );

  const serverErrors = state && !state.ok ? friendlyFieldErrors(state.fieldErrors) : undefined;
  const errors = clientErrors ?? serverErrors;
  const serverFailure = state && !state.ok ? state : null;

  useEffect(() => {
    if (serverFailure?.code === "UNAUTHENTICATED") fail(serverFailure);
    else if (serverFailure) alertRef.current?.focus();
  }, [serverFailure, fail]);

  // Restore an unsent draft (for example after the session expired mid-edit). localStorage only exists after
  // hydration, so this has to run in an effect; the setState calls are the external-system sync.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { values?: Partial<PromptFormValues>; overrides?: Record<string, VariableOverride> };
      if (saved.values && typeof saved.values === "object") setValues((v) => ({ ...v, ...saved.values }));
      if (saved.overrides && typeof saved.overrides === "object") setOverrides(saved.overrides);
    } catch { /* storage unavailable or corrupt draft */ }
  }, [draftKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist on change (never before the user touched the form, so an untouched edit page cannot leave a stale draft).
  useEffect(() => {
    if (!dirtyRef.current) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ values, overrides }));
    } catch { /* storage unavailable or full */ }
  }, [values, overrides, draftKey, serverFailure]);

  // Move focus to the first invalid control after a failed validation.
  useEffect(() => {
    if (!clientErrors && !serverFailure) return;
    const el = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: "center" });
    }
  }, [clientErrors, serverFailure]);

  function set<K extends keyof PromptFormValues>(key: K, value: PromptFormValues[K]) {
    dirtyRef.current = true;
    setValues((v) => ({ ...v, [key]: value }));
    setClientErrors(null);
  }

  function setOverride(key: string, patch: VariableOverride) {
    dirtyRef.current = true;
    setOverrides((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const submitted: PromptFormValues = { ...values, body: built.body, variables: built.variables };
    const extra: Record<string, string> = mode === "edit" ? { promptId: promptId ?? "", slug: slug ?? "" } : {};
    const fd = promptValuesToFormData(submitted, extra);

    if (built.errors.length > 0) {
      setClientErrors({ body: built.errors.map((x) => x.message) });
      return;
    }
    const parsed = promptInputSchema.safeParse(promptFormDataToInput(fd));
    if (!parsed.success) {
      const out: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length ? issue.path.map(String).join(".") : "_root";
        (out[key] ??= []).push(issue.message);
      }
      setClientErrors(friendlyFieldErrors(out) ?? null);
      return;
    }
    setClientErrors(null);
    // A successful save redirects away, so the draft is dropped now; a failure re-saves it (effect above).
    dirtyRef.current = true;
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
    startTransition(() => formAction(fd));
  }

  const err = (name: string) => fieldMessages(errors, name);
  const id = (name: string) => `${uid}-${name}`;
  const bodyErrors = [...err("body"), ...built.errors.map((x) => x.message).filter((m) => !err("body").includes(m))];
  const hasFieldErrors = errors ? Object.keys(errors).length > 0 : false;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-8" aria-busy={pending}>
      {reviewNotice && mode === "create" ? (
        <Alert>
          <Info />
          <AlertTitle>New members&apos; prompts are reviewed before publishing</AlertTitle>
          <AlertDescription>Yours will show as pending in My prompts until a moderator approves it.</AlertDescription>
        </Alert>
      ) : null}

      <Alert>
        <Info />
        <AlertTitle>Before you submit</AlertTitle>
        <AlertDescription>
          Share original, useful prompts. No jailbreaks, NSFW content, personal data or ads.{" "}
          <Link href="/guidelines" className="underline underline-offset-4">Read the community guidelines</Link>.
        </AlertDescription>
      </Alert>

      {serverFailure && serverFailure.code !== "UNAUTHENTICATED" ? (
        <div ref={alertRef} tabIndex={-1} role="alert" className="outline-none">
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>
              {serverFailure.code === "RATE_LIMITED" ? "Slow down a little"
                : serverFailure.code === "VALIDATION" ? "This prompt needs a few changes" : "Could not save"}
            </AlertTitle>
            <AlertDescription>{serverFailure.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {hasFieldErrors && !serverFailure ? (
        <p role="alert" className="text-sm text-destructive">Please fix the highlighted fields.</p>
      ) : null}

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold tracking-tight">The prompt</legend>
        <Field id={id("title")} label="Title" errors={err("title")} counter={`${values.title.length}/100`}
          hint="A clear, specific name. Say what it does.">
          <Input id={id("title")} value={values.title} maxLength={100} required aria-invalid={err("title").length > 0}
            aria-describedby={`${id("title")}-hint`} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field id={id("description")} label="Description" errors={err("description")} counter={`${values.description.length}/300`}
          hint="One or two sentences shown on cards and in search results.">
          <Textarea id={id("description")} rows={3} value={values.description} maxLength={300} required
            aria-invalid={err("description").length > 0} aria-describedby={`${id("description")}-hint`}
            onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field id={id("body")} label="Prompt text" errors={bodyErrors} counter={`${values.body.length}/8000`}
          hint="Use {{variable}} for blanks people fill in. Add a type or default inline, for example {{tone:select(formal, casual)|formal}}.">
          <Textarea id={id("body")} rows={12} value={values.body} maxLength={8000} required spellCheck={false}
            className="font-mono text-[13px] leading-relaxed" aria-invalid={bodyErrors.length > 0}
            aria-describedby={`${id("body")}-hint`} onChange={(e) => set("body", e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="space-y-4" aria-describedby={id("vars-hint")}>
        <legend className="mb-1 text-lg font-semibold tracking-tight">Variables</legend>
        <p id={id("vars-hint")} className="text-sm text-muted-foreground">
          We detect every <code className="rounded bg-muted px-1 font-mono text-xs">{"{{variable}}"}</code> in your text. Tune how each one is asked for.
        </p>
        {built.variables.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="no-variables">
            No variables yet. Add {"{{topic}}"} to the prompt text to let people fill it in.
          </p>
        ) : (
          <ul className="space-y-3">
            {built.variables.map((v) => (
              <VariableRow key={v.key} def={v} uid={uid} errors={err(`variables.${built.variables.indexOf(v)}`)}
                onChange={(patch) => setOverride(v.key, patch)} />
            ))}
          </ul>
        )}
      </fieldset>

      <section aria-labelledby={id("preview-h")} className="space-y-2">
        <h2 id={id("preview-h")} className="text-lg font-semibold tracking-tight">Live preview</h2>
        <div data-testid="preview" className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
          {values.body.trim() === "" ? (
            <span className="text-muted-foreground">Your prompt appears here as you type.</span>
          ) : preview.segments.map((s, i) => (
            s.kind === "var" ? (
              <span key={i} className={cn(
                "rounded px-1 py-0.5 font-medium",
                s.filled ? "bg-primary/15 text-foreground" : "bg-amber-400/20 text-foreground",
              )}>{s.text}</span>
            ) : <span key={i}>{s.text}</span>
          ))}
        </div>
      </section>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold tracking-tight">Details</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={id("category")} label="Category" errors={err("categorySlug")}>
            <NativeSelect id={id("category")} value={values.categorySlug} required aria-invalid={err("categorySlug").length > 0}
              onChange={(e) => set("categorySlug", e.target.value)}>
              <option value="" disabled>Choose a category</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field id={id("use")} label="Use case" errors={err("useCase")}>
            <NativeSelect id={id("use")} value={values.useCase} aria-invalid={err("useCase").length > 0}
              onChange={(e) => set("useCase", e.target.value as PromptFormValues["useCase"])}>
              {USE_CASES.map((u) => <option key={u} value={u}>{USE_CASE_LABELS[u]}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field id={id("tags")} label="Tags" errors={err("tags")}>
          <TagInput id={id("tags")} value={values.tags} onChange={(t) => set("tags", t)} invalid={err("tags").length > 0}
            suggestUrl={suggestUrl} />
        </Field>
        <div className="space-y-1.5">
          <p id={id("models-label")} className="text-sm font-medium">Works best with</p>
          <p className="text-xs text-muted-foreground">Pick up to 6. Leave empty if it works with any model.</p>
          <ModelSelect value={values.models} onChange={(m) => set("models", m)} labelledBy={id("models-label")} />
          {err("models").length > 0 ? <p role="alert" className="text-sm text-destructive">{err("models").join(" ")}</p> : null}
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold tracking-tight">Extras</legend>
        <Field id={id("example")} label="Example output (optional)" errors={err("exampleOutput")}
          counter={`${values.exampleOutput.length}/6000`} hint="Show what a good result looks like.">
          <Textarea id={id("example")} rows={6} value={values.exampleOutput} maxLength={6000}
            aria-describedby={`${id("example")}-hint`} onChange={(e) => set("exampleOutput", e.target.value)} />
        </Field>
        <Field id={id("notes")} label="Notes and tips (optional)" errors={err("notes")} counter={`${values.notes.length}/2000`}>
          <Textarea id={id("notes")} rows={4} value={values.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <div className="space-y-2">
          <p id={id("license-label")} className="text-sm font-medium">License</p>
          <RadioGroup value={values.license} onValueChange={(v) => set("license", v as PromptFormValues["license"])}
            aria-labelledby={id("license-label")}>
            <div className="flex items-start gap-2.5">
              <RadioGroupItem value="cc_by_4" id={id("lic-by")} className="mt-0.5" />
              <Label htmlFor={id("lic-by")} className="flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">CC BY 4.0 (default)</span>
                <span className="text-xs text-muted-foreground">Anyone can use and adapt it if they credit you.</span>
              </Label>
            </div>
            <div className="flex items-start gap-2.5">
              <RadioGroupItem value="cc0" id={id("lic-cc0")} className="mt-0.5" />
              <Label htmlFor={id("lic-cc0")} className="flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">CC0 (public domain)</span>
                <span className="text-xs text-muted-foreground">No rights reserved and no credit required.</span>
              </Label>
            </div>
          </RadioGroup>
        </div>
        {mode === "edit" ? (
          <Field id={id("change")} label="What changed? (optional)" errors={err("changeNote")}
            counter={`${values.changeNote.length}/200`} hint="Shown in the version history.">
            <Input id={id("change")} value={values.changeNote} maxLength={200}
              aria-describedby={`${id("change")}-hint`} onChange={(e) => set("changeNote", e.target.value)} />
          </Field>
        ) : null}
        {values.forkedFromShortId ? (
          <p className="text-sm text-muted-foreground">This prompt will be published as a fork of the original.</p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === "edit" ? "Save changes" : "Submit prompt"}
        </Button>
        <Link href={mode === "edit" && slug ? `/p/${slug}` : "/prompts"} className={buttonVariants({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

const TYPE_LABELS: Record<VariableDef["type"], string> = { text: "Short text", long: "Long text", select: "Select", number: "Number" };

function VariableRow({
  def, uid, errors, onChange,
}: { def: VariableDef; uid: string; errors: string[]; onChange: (patch: VariableOverride) => void }) {
  const base = `${uid}-var-${def.key}`;
  const [optionsText, setOptionsText] = useState((def.options ?? []).join(", "));
  // Keep the raw text while typing, but follow changes that come from the body (inline shorthand edits).
  const joined = (def.options ?? []).join(", ");
  const lastJoined = useRef(joined);
  useEffect(() => {
    if (lastJoined.current !== joined) {
      lastJoined.current = joined;
      setOptionsText(joined);
    }
  }, [joined]);

  return (
    <li className="space-y-3 rounded-lg border p-4" data-testid="variable-row" data-key={def.key}>
      <div className="flex items-center justify-between gap-2">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{`{{${def.key}}}`}</code>
        <div className="flex items-center gap-2">
          <Checkbox id={`${base}-required`} checked={def.required} aria-label={`Required for ${def.key}`}
            onCheckedChange={(c) => onChange({ required: c === true })} />
          <Label htmlFor={`${base}-required`} className="text-sm font-normal">Required</Label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${base}-label`} className="text-xs text-muted-foreground">Label</Label>
          <Input id={`${base}-label`} aria-label={`Label for ${def.key}`} value={def.label} maxLength={60}
            onChange={(e) => onChange({ label: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${base}-type`} className="text-xs text-muted-foreground">Type</Label>
          <NativeSelect id={`${base}-type`} aria-label={`Type for ${def.key}`} value={def.type}
            onChange={(e) => onChange({ type: e.target.value as VariableDef["type"] })}>
            {(Object.keys(TYPE_LABELS) as VariableDef["type"][]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </NativeSelect>
        </div>
        {def.type === "select" ? (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`${base}-options`} className="text-xs text-muted-foreground">Options (comma separated, 2 to 20)</Label>
            <Input id={`${base}-options`} aria-label={`Options for ${def.key}`} value={optionsText}
              onChange={(e) => { setOptionsText(e.target.value); onChange({ optionsText: e.target.value }); }} />
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor={`${base}-default`} className="text-xs text-muted-foreground">Default value</Label>
          <Input id={`${base}-default`} aria-label={`Default for ${def.key}`} value={def.default ?? ""} maxLength={500}
            onChange={(e) => onChange({ default: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${base}-help`} className="text-xs text-muted-foreground">Help text</Label>
          <Input id={`${base}-help`} aria-label={`Help for ${def.key}`} value={def.help ?? ""} maxLength={200}
            onChange={(e) => onChange({ help: e.target.value })} />
        </div>
      </div>
      {errors.length > 0 ? <p role="alert" className="text-sm text-destructive">{errors.join(" ")}</p> : null}
    </li>
  );
}
