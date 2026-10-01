"use client";

import { ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODEL_TARGETS, OPEN_TARGETS, buildOpenLink } from "@/lib/models";
import type { AiModel } from "@/lib/types";
import { copyText } from "./clipboard";

const PRIMARY: AiModel[] = ["chatgpt", "claude"];

/** Declared models first, otherwise the original order. */
export function sortByDeclared(targets: AiModel[], declared: AiModel[]): AiModel[] {
  const rank = (m: AiModel) => (declared.includes(m) ? 0 : 1);
  return targets.map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map((x) => x.m);
}

/** True when every declared model is an image/video/open-weight one without an "Open in" target. */
export function isCopyOnlyPrompt(models: AiModel[]): boolean {
  return models.length > 0 && models.every((m) => MODEL_TARGETS[m]?.mode === "none");
}

export function OpenInMenu({
  text, models, onOpened,
}: {
  text: string;
  models: AiModel[];
  onOpened?: (info: { model: AiModel; prefilled: boolean }) => void;
}) {
  if (isCopyOnlyPrompt(models)) return null;

  const primary = sortByDeclared(PRIMARY, models);
  const more = sortByDeclared(OPEN_TARGETS.filter((m) => !PRIMARY.includes(m)), models);

  async function open(model: AiModel) {
    const link = buildOpenLink(model, text);
    if (!link) return;
    // The clipboard write starts first (synchronously, inside the click) and window.open follows in the same gesture.
    const copied = copyText(text);
    window.open(link.url, "_blank", "noopener");
    onOpened?.({ model, prefilled: link.prefilled });
    const ok = await copied;
    if (!ok) {
      toast.error(link.prefilled ? "Could not copy to the clipboard." : "Could not copy. Select the preview text and copy it manually.");
    } else if (link.prefilled) {
      toast.success("Copied", link.warning ? { description: link.warning } : undefined);
    } else {
      toast.success("Copied – paste with ⌘V / Ctrl+V", link.warning ? { description: link.warning } : undefined);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {primary.map((m) => (
          <Button key={m} type="button" variant="outline" size="lg" onClick={() => void open(m)}
            aria-label={`Open in ${MODEL_TARGETS[m].name}`}>
            <ExternalLink className="size-3.5" aria-hidden="true" /> {MODEL_TARGETS[m].name}
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="lg" aria-label="Open in another app">
              More <ChevronDown className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Copies, then opens</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {more.map((m) => {
              const t = MODEL_TARGETS[m];
              const autosend = t.mode === "autosend";
              return (
                <DropdownMenuItem key={m} onSelect={() => void open(m)}
                  title={autosend ? "Perplexity sends the prompt immediately" : undefined}>
                  <span className="flex-1">{t.name}</span>
                  {autosend ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="size-3" aria-hidden="true" /> Sends immediately
                    </span>
                  ) : t.mode === "copy_only" ? (
                    <span className="text-xs text-muted-foreground">Paste it in</span>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
