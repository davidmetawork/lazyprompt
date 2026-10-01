// Pure mappers from server DTOs to MCP structuredContent. Results never carry timestamps, emails, ids of
// sessions or tokens (ARCHITECTURE.md section 12). No server-only imports.
import { absoluteUrl } from "@/lib/base-url";
import { MAX_EXAMPLE_OUTPUT } from "./config";
import type { AiModel, CategoryWithCount, PromptCard, PromptDetail, VariableDef } from "@/lib/types";

export interface SearchResultItem {
  id: string; title: string; description: string; category: string; tags: string[]; models: AiModel[];
  rating: number | null; ratingCount: number; copies: number; variableCount: number; url: string;
}

export function roundRating(avg: number | null): number | null {
  return avg === null || Number.isNaN(avg) ? null : Math.round(avg * 10) / 10;
}

export function promptUrl(slug: string): string {
  return absoluteUrl(`/p/${slug}`);
}

export function toSearchResult(p: PromptCard): SearchResultItem {
  return {
    id: p.shortId, title: p.title, description: p.description, category: p.category.slug, tags: p.tags, models: p.models,
    rating: roundRating(p.ratingAvg), ratingCount: p.ratingCount, copies: p.copyCount, variableCount: p.variableCount,
    url: promptUrl(p.slug),
  };
}

export interface PromptResult {
  id: string; title: string; description: string; body: string; variables: VariableDef[];
  exampleOutput: string | null; exampleOutputTruncated: boolean; notes: string | null;
  category: { slug: string; name: string }; tags: string[]; models: AiModel[];
  rating: number | null; ratingCount: number; author: { name: string; username: string };
  license: string; url: string;
}

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  return text.length <= max ? { text, truncated: false } : { text: `${text.slice(0, max - 1)}…`, truncated: true };
}

/** Display names come from sign-up and may be an email address; never expose one. */
export function displayName(name: string, username: string): string {
  return name.includes("@") ? username : name;
}

export function toPromptResult(p: PromptDetail): PromptResult {
  const example = p.exampleOutput ? truncate(p.exampleOutput, MAX_EXAMPLE_OUTPUT) : null;
  return {
    id: p.shortId, title: p.title, description: p.description, body: p.body, variables: p.variables,
    exampleOutput: example?.text ?? null, exampleOutputTruncated: example?.truncated ?? false, notes: p.notes,
    category: { slug: p.category.slug, name: p.category.name }, tags: p.tags, models: p.models,
    rating: roundRating(p.ratingAvg), ratingCount: p.ratingCount,
    author: { name: displayName(p.author.name, p.author.username), username: p.author.username }, license: p.license, url: promptUrl(p.slug),
  };
}

export function toCategoryResult(c: CategoryWithCount): { slug: string; name: string; description: string; promptCount: number } {
  return { slug: c.slug, name: c.name, description: c.description, promptCount: c.promptCount };
}
