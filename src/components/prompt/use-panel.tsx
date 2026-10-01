"use client";

import { useMemo, useState } from "react";
import { renderTemplate } from "@/lib/template";
import type { AiModel, PromptDetail } from "@/lib/types";
import { CopyButton } from "./copy-button";
import { FeedbackBar } from "./feedback-bar";
import { OpenInMenu } from "./open-in-menu";
import { PromptPreview } from "./prompt-preview";
import { sendUsageEvent } from "./use-usage";
import { useVariableValues } from "./use-variable-values";
import { VariableForm } from "./variable-form";

export type UsePanelPrompt = Pick<PromptDetail, "id" | "shortId" | "body" | "variables" | "models" | "title">;

/**
 * The client "use" panel: fill-in form, live preview, copy and open-in actions, feedback.
 * Variable values stay in the browser (localStorage) and are never sent anywhere.
 */
export function UsePanel({ prompt, category }: { prompt: UsePanelPrompt; category?: string }) {
  const { values, setValue, reset } = useVariableValues(prompt.shortId, prompt.variables);
  const [used, setUsed] = useState<{ model?: AiModel } | null>(null);
  const rendered = useMemo(() => renderTemplate(prompt.body, prompt.variables, values), [prompt.body, prompt.variables, values]);
  const filled = prompt.variables.length === 0 || rendered.segments.some((s) => s.kind === "var" && s.filled);

  return (
    <section aria-label={`Use "${prompt.title}"`} className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="text-base font-semibold tracking-tight">Use this prompt</h2>
      <VariableForm variables={prompt.variables} values={values} onChange={setValue} onReset={reset} />
      <PromptPreview body={prompt.body} variables={prompt.variables} values={values} />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton
            text={rendered.text}
            onCopied={() => {
              setUsed((u) => u ?? {});
              sendUsageEvent({ promptId: prompt.id, type: "copy" }, { category, filled });
            }}
          />
          <OpenInMenu
            text={rendered.text}
            models={prompt.models}
            onOpened={({ model, prefilled }) => {
              setUsed({ model });
              sendUsageEvent({ promptId: prompt.id, type: "open", model }, { prefilled });
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Don&apos;t include passwords or secrets.</p>
      </div>
      {used ? <FeedbackBar promptId={prompt.id} model={used.model} /> : null}
    </section>
  );
}
