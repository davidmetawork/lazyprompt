import { MODEL_TARGETS } from "@/lib/models";
import { labelFromKey } from "@/lib/template";
import type { AiModel, License, PromptStatus, UseCase } from "@/lib/types";

export function modelName(model: AiModel): string {
  return MODEL_TARGETS[model]?.name ?? labelFromKey(model);
}

export function labelForUseCase(useCase: UseCase | string): string {
  return labelFromKey(useCase);
}

/** Two-letter badge text for a model, e.g. "ChatGPT" -> "Ch". */
export function modelInitials(model: AiModel): string {
  const name = modelName(model);
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2);
}

export const STATUS_LABELS: Record<PromptStatus, string> = {
  draft: "Draft",
  pending: "Pending review",
  published: "Published",
  rejected: "Rejected",
  hidden: "Hidden",
  removed: "Removed",
};

export const LICENSE_INFO: Record<License, { label: string; url: string }> = {
  cc0: { label: "CC0 (public domain)", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  cc_by_4: { label: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
};

/**
 * Prompt page <title> (the root layout template appends " | LazyPrompt"). The visible
 * "<title> – AI prompt | LazyPrompt" stays within 60 characters; a long title is shortened, the keyword suffix is kept.
 */
export function promptPageTitle(title: string): string {
  const brand = " | LazyPrompt";
  const suffix = " – AI prompt";
  const room = 60 - brand.length - suffix.length;
  if (title.length <= room) return `${title}${suffix}`;
  return `${title.slice(0, room - 1).trimEnd()}…${suffix}`;
}
