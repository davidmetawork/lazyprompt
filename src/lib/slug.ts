import { randomInt } from "node:crypto";

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Lowercase kebab-case ASCII slug. Strips diacritics, collapses separators, trims dashes. */
export function slugify(input: string, max = 60): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/g, "");
}

function randomChars(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += BASE36[randomInt(0, 36)];
  return out;
}

/** 7 lowercase base36 characters. */
export function newShortId(): string {
  return randomChars(7);
}

export function buildPromptSlug(title: string, shortId: string): string {
  const base = slugify(title, 60);
  return base ? `${base}-${shortId}` : shortId;
}

/** The shortId is always the last 7 [0-9a-z] characters after the final dash (or the whole slug). */
export function parseShortIdFromSlug(slug: string): string | null {
  const m = /(?:^|-)([0-9a-z]{7})$/.exec(slug);
  return m?.[1] ?? null;
}

/** Lowercase, [a-z0-9-], collapsed dashes, 2-32 chars; null if it cannot be normalized. */
export function normalizeTag(raw: string): string | null {
  const s = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return s.length >= 2 ? s : null;
}

/** Slugified seed (no dashes at the ends) + 4 random chars; matches ^[a-z0-9][a-z0-9_-]{2,29}$. */
export function generateUsername(seed: string): string {
  let base = slugify(seed, 20).replace(/-+/g, "-");
  if (!base) base = "user";
  if (base.length < 2) base = `${base}u`;
  return `${base}-${randomChars(4)}`;
}
