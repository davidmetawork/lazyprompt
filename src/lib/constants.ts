// Single source of enum values; imported by the DB schema, zod validation and the UI.
// Must stay CLI safe: no server-side-only marker import and nothing from src/server (ARCHITECTURE.md section 7).
export const AI_MODELS = ["chatgpt","claude","gemini","perplexity","grok","copilot","mistral","deepseek","llama",
  "midjourney","stable_diffusion","flux","sora","veo"] as const;
export const USE_CASES = ["generate","rewrite","summarize","extract","analyze","brainstorm","plan","critique",
  "translate","tutor","roleplay","system_prompt"] as const;
export const VARIABLE_TYPES = ["text","long","select","number"] as const;
export const PROMPT_STATUSES = ["draft","pending","published","rejected","hidden","removed"] as const;
export const COMMENT_STATUSES = ["visible","pending","hidden","removed"] as const;
export const LICENSES = ["cc0","cc_by_4"] as const;
export const USAGE_EVENT_TYPES = ["copy","open","render","worked","not_worked"] as const;
export const EVENT_SOURCES = ["web","mcp"] as const;
export const REPORT_TARGETS = ["prompt","comment","user"] as const;
export const REPORT_REASONS = ["spam","broken","jailbreak","nsfw","harassment","copyright","personal_data","other"] as const;
export const REPORT_STATUSES = ["open","actioned","dismissed"] as const;
export const MOD_ACTIONS = ["approve","reject","hide","restore","remove","feature","unfeature","auto_flag","auto_hide",
  "ban","unban","set_trust","resolve_report","dismiss_report"] as const;
export const SORT_KEYS = ["relevance","top","trending","new"] as const;
export const SYSTEM_USER_ID = "lp_system";

// Not part of the section 3 list, but shared by several packages.
export const SITE_NAME = "LazyPrompt";
export const SITE_TAGLINE = "Free, community-rated AI prompts. Fill in the blanks, copy, done.";
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;
export const MAX_PAGE = 50;
export const MAX_TEMPLATE_KEYS = 20;
