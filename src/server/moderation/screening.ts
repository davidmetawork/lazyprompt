import "server-only";
import { env } from "@/lib/env";
import { findSimilarPrompts } from "@/server/prompts/queries";
import type { ScreeningFlag, ScreeningResult, TrustLevel } from "@/lib/types";

export interface ScreenInput {
  kind: "prompt" | "comment";
  title?: string;
  text: string;
  author: { trustLevel: TrustLevel; accountAgeDays: number };
  excludePromptId?: string;
  /**
   * Additional user text (description, notes, example output, ...) that is scanned by the heuristics and sent to
   * the moderation API, but is NOT used for duplicate detection (which compares `title` + `text` only).
   */
  extraText?: string;
}

export const DUPLICATE_THRESHOLD = 0.85;

const SHORTENER_HOSTS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rebrand.ly", "shorturl.at", "rb.gy",
];
/** Hosts whose `utm_` parameters are ordinary content links rather than tracking for a seller. */
const CONTENT_HOSTS = [
  "lazyprompt.ai", "wikipedia.org", "github.com", "arxiv.org", "openai.com", "anthropic.com", "google.com",
  "youtube.com", "youtu.be", "medium.com", "substack.com",
];

const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /\bDAN\b/,
  /developer\s+mode/i,
  /jailbreak/i,
  /no\s+(?:ethical|content)\s+(?:guidelines|restrictions)/i,
  /do\s+anything\s+now/i,
];
const SEO_SPAM_PATTERNS: RegExp[] = [
  /100%\s+unique/i,
  /plagiarism[- ]free/i,
  /undetectable/i,
  /bypass\s+(?:ai|gpt)\s+detect/i,
  /humanize\b[^\n]*\bdetector/i,
];

// One alternation so URLs never overlap: scheme URLs, www. URLs, and bare shortener / amzn.to hosts.
const URL_RE = new RegExp(
  String.raw`(?:https?:\/\/|www\.)[^\s<>"'\x60]+|\b(?:${[...SHORTENER_HOSTS, "amzn.to"].map((h) => h.replace(/\./g, "\\.")).join("|")})\/[^\s<>"'\x60]*`,
  "gi",
);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const PHONE_RE = /(?<![\w.])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?![\w])/;
const CHAR_REPEAT_RE = /([\p{L}\p{N}!?$])\1{10,}/u;
const WORD_REPEAT_RE = /\b([\p{L}\p{N}']+)(?:\s+\1\b){10,}/iu;

function hostOf(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
const hostMatches = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));

function parseUrl(raw: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function isAffiliate(raw: string): boolean {
  const u = parseUrl(raw);
  if (!u) return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "amzn.to" || host.endsWith(".amzn.to")) return true;
  const keys = [...u.searchParams.keys()].map((k) => k.toLowerCase());
  if (keys.includes("tag") || keys.includes("ref") || keys.some((k) => k === "aff" || k.startsWith("aff_") || k.startsWith("affiliate"))) {
    return true;
  }
  if (/(?:^|[/_-])aff(?:iliate)?(?:[/_-]|$)/i.test(u.pathname)) return true;
  if (keys.some((k) => k.startsWith("utm_")) && !hostMatches(host, CONTENT_HOSTS)) return true;
  return false;
}

function uppercaseRatio(s: string): number {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const upper = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).length;
  return upper / letters.length;
}

type Severity = "review" | "reject";

/**
 * Pure section 11 heuristics. Verdict: any `shortener` rejects; any other triggered rule routes to review;
 * a clean text is allowed. (`new_user` is informational on prompts: createPrompt already queues trust 0.)
 */
export function runHeuristics(input: ScreenInput): ScreeningResult {
  const flags = new Set<ScreeningFlag>();
  const reasons = new Set<string>();
  let verdict: ScreeningResult["verdict"] = "allow";
  const add = (flag: ScreeningFlag, reason: string, severity?: Severity) => {
    flags.add(flag);
    reasons.add(reason);
    if (severity === "reject") verdict = "reject";
    else if (severity === "review" && verdict === "allow") verdict = "review";
  };

  const title = input.title ?? "";
  const all = [title, input.text, input.extraText ?? ""].filter(Boolean).join("\n");

  const urls = all.match(URL_RE) ?? [];
  if (urls.length > 0) add("link", `Contains ${urls.length === 1 ? "a link" : `${urls.length} links`}`);
  if (urls.length > 2) add("too_many_links", `Contains more than 2 links (${urls.length})`, "review");
  for (const raw of urls) {
    const host = hostOf(raw);
    if (host && hostMatches(host, SHORTENER_HOSTS)) {
      add("shortener", `Uses a link shortener (${host}); post the full URL instead`, "reject");
    }
    if (isAffiliate(raw)) add("affiliate", "Contains an affiliate or tracking link", "review");
  }

  if (JAILBREAK_PATTERNS.some((re) => re.test(all))) {
    add("jailbreak", "Looks like a jailbreak or safety-bypass prompt", "review");
  }
  if (SEO_SPAM_PATTERNS.some((re) => re.test(all))) {
    add("seo_spam", "Contains SEO or detector-evasion spam phrases", "review");
  }
  if (EMAIL_RE.test(all)) add("contact_info", "Contains an email address", "review");
  else if (PHONE_RE.test(all)) add("contact_info", "Contains a phone number", "review");

  if (title.trim().length > 12 && uppercaseRatio(title) > 0.6) {
    add("shouting", "The title is mostly capital letters", "review");
  }
  if (CHAR_REPEAT_RE.test(all) || WORD_REPEAT_RE.test(all)) {
    add("repetition", "Repeats a character or word more than 10 times", "review");
  }

  if (input.author.trustLevel === 0 && flags.has("link")) {
    add("link", "New accounts need review before posting links", "review");
  }
  if (input.kind === "prompt" && input.author.trustLevel === 0) {
    add("new_user", "First prompts from new accounts are reviewed");
  }

  return { verdict, flags: [...flags], reasons: [...reasons] };
}

interface OpenAiModerationResponse {
  results?: { flagged?: boolean; categories?: Record<string, boolean> }[];
}

/** Returns null on any failure (fail open). Never logs the text. */
async function openAiModerate(text: string): Promise<{ flagged: boolean; minors: boolean } | null> {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text.slice(0, 20_000) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as OpenAiModerationResponse;
    const r = json.results?.[0];
    if (!r) return null;
    return { flagged: Boolean(r.flagged), minors: Boolean(r.categories?.["sexual/minors"]) };
  } catch {
    return null;
  }
}

/** Heuristics + duplicate detection (prompts) + OpenAI moderation when OPENAI_API_KEY is set. */
export async function screenContent(input: ScreenInput): Promise<ScreeningResult> {
  const base = runHeuristics(input);
  const flags = [...base.flags];
  const reasons = [...base.reasons];
  let verdict = base.verdict;
  let duplicateOfId: string | undefined;

  if (input.kind === "prompt") {
    try {
      const [top] = await findSimilarPrompts(
        { title: input.title ?? "", body: input.text },
        { excludeId: input.excludePromptId, limit: 1 },
      );
      if (top && top.similarity > DUPLICATE_THRESHOLD) {
        flags.push("duplicate");
        reasons.push(`Very similar to an existing prompt: "${top.title}"`);
        duplicateOfId = top.id;
        if (verdict === "allow") verdict = "review";
      }
    } catch (e) {
      console.error("[screening] duplicate check failed", e instanceof Error ? e.message : "unknown");
    }
  }

  if (verdict !== "reject") {
    const mod = await openAiModerate([input.title, input.text, input.extraText].filter(Boolean).join("\n\n"));
    if (mod?.minors) {
      flags.push("openai_flagged");
      reasons.push("Flagged by automated content moderation");
      verdict = "reject";
    } else if (mod?.flagged) {
      flags.push("openai_flagged");
      reasons.push("Flagged by automated content moderation");
      if (verdict === "allow") verdict = "review";
    }
  }

  return { verdict, flags, reasons, ...(duplicateOfId ? { duplicateOfId } : {}) };
}
