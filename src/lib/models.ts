import type { AiModel } from "./types";

export interface ModelTarget {
  id: AiModel; name: string; vendor: string; baseUrl: string | null;
  mode: "prefill" | "autosend" | "confirm" | "copy_only" | "none";
  buildUrl?: (encoded: string) => string; note?: string;
}

export const MAX_DEEP_LINK_LENGTH = 1900;

export const MODEL_TARGETS: Record<AiModel, ModelTarget> = {
  chatgpt: { id: "chatgpt", name: "ChatGPT", vendor: "OpenAI", baseUrl: "https://chatgpt.com/", mode: "prefill",
    buildUrl: (q) => `https://chatgpt.com/?q=${q}` },
  claude: { id: "claude", name: "Claude", vendor: "Anthropic", baseUrl: "https://claude.ai/new", mode: "prefill",
    buildUrl: (q) => `https://claude.ai/new?q=${q}`,
    note: "If Claude opens empty, paste the prompt (it is already on your clipboard)." },
  perplexity: { id: "perplexity", name: "Perplexity", vendor: "Perplexity", baseUrl: "https://www.perplexity.ai/", mode: "autosend",
    buildUrl: (q) => `https://www.perplexity.ai/search?q=${q}`, note: "Perplexity sends the prompt immediately." },
  grok: { id: "grok", name: "Grok", vendor: "xAI", baseUrl: "https://grok.com/", mode: "confirm",
    buildUrl: (q) => `https://grok.com/?q=${q}` },
  gemini: { id: "gemini", name: "Gemini", vendor: "Google", baseUrl: "https://gemini.google.com/app", mode: "copy_only" },
  copilot: { id: "copilot", name: "Copilot", vendor: "Microsoft", baseUrl: "https://copilot.microsoft.com/", mode: "copy_only" },
  mistral: { id: "mistral", name: "Mistral", vendor: "Mistral AI", baseUrl: "https://chat.mistral.ai/chat", mode: "copy_only" },
  deepseek: { id: "deepseek", name: "DeepSeek", vendor: "DeepSeek", baseUrl: "https://chat.deepseek.com/", mode: "copy_only" },
  // Image/video/open-weight models have no "Open in" button: Copy only.
  llama: { id: "llama", name: "Llama", vendor: "Meta", baseUrl: null, mode: "none" },
  midjourney: { id: "midjourney", name: "Midjourney", vendor: "Midjourney", baseUrl: null, mode: "none" },
  stable_diffusion: { id: "stable_diffusion", name: "Stable Diffusion", vendor: "Stability AI", baseUrl: null, mode: "none" },
  flux: { id: "flux", name: "Flux", vendor: "Black Forest Labs", baseUrl: null, mode: "none" },
  sora: { id: "sora", name: "Sora", vendor: "OpenAI", baseUrl: null, mode: "none" },
  veo: { id: "veo", name: "Veo", vendor: "Google", baseUrl: null, mode: "none" },
};

export const OPEN_TARGETS: AiModel[] = ["chatgpt", "claude", "gemini", "perplexity", "grok", "copilot", "mistral", "deepseek"];

/**
 * Builds the "Open in <model>" link. Returns null for models without an Open button.
 * Falls back to the base URL (prefilled:false) for copy-only models or when the full URL would exceed 1900 chars.
 */
export function buildOpenLink(model: AiModel, text: string): { url: string; prefilled: boolean; warning?: string } | null {
  const t = MODEL_TARGETS[model];
  if (!t || t.mode === "none" || !t.baseUrl) return null;
  if (t.mode === "copy_only" || !t.buildUrl) return { url: t.baseUrl, prefilled: false };
  const full = t.buildUrl(encodeURIComponent(text));
  if (full.length > MAX_DEEP_LINK_LENGTH) {
    return { url: t.baseUrl, prefilled: false, warning: "Prompt too long to prefill; paste it instead." };
  }
  const warning = t.mode === "autosend" ? "Sends immediately" : t.note;
  return { url: full, prefilled: true, ...(warning ? { warning } : {}) };
}
