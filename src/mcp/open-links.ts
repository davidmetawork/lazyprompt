// "Open in <assistant>" links for render_prompt. Pure module.
import { MODEL_TARGETS, OPEN_TARGETS, buildOpenLink } from "@/lib/models";
import type { AiModel } from "@/lib/types";

const MAX_LINKS = 4;
const DEFAULT_LINK_MODELS: AiModel[] = ["chatgpt", "claude", "gemini", "perplexity"];

/** Prompt-declared models first, then the common assistants, capped to keep the result small. */
export function pickOpenModels(declared: AiModel[]): AiModel[] {
  const out: AiModel[] = [];
  for (const m of [...declared.filter((d) => OPEN_TARGETS.includes(d)), ...DEFAULT_LINK_MODELS]) {
    if (!out.includes(m)) out.push(m);
    if (out.length === MAX_LINKS) break;
  }
  return out;
}

export function buildOpenLinks(text: string, declared: AiModel[]): { model: AiModel; name: string; url: string; prefilled: boolean }[] {
  const links: { model: AiModel; name: string; url: string; prefilled: boolean }[] = [];
  for (const model of pickOpenModels(declared)) {
    const link = buildOpenLink(model, text);
    if (link) links.push({ model, name: MODEL_TARGETS[model].name, url: link.url, prefilled: link.prefilled });
  }
  return links;
}
