// The MCP Apps host bridge. Handlers are registered BEFORE connect() so no early notification is lost, and the latest
// state is kept in a tiny store so React can mount afterwards. The widget never fetches: data arrives through tool
// results or app.callServerTool.
import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import { interpretResult, textOf } from "./model";
import type { ListState, ToolResult, View } from "./types";

export interface HostState {
  theme: "light" | "dark";
  maxHeight: number | undefined;
  insets: { top: number; right: number; bottom: number; left: number };
}

export interface BridgeState {
  view: View;
  host: HostState;
  connected: boolean;
}

type HostContext = ReturnType<App["getHostContext"]>;

const app = new App({ name: "lazyprompt-widget", version: "1.0.0" }, {}, { autoResize: true });

let state: BridgeState = {
  view: { kind: "loading", label: "Loading..." },
  host: { theme: "light", maxHeight: undefined, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  connected: false,
};
const listeners = new Set<() => void>();
let lastArgs: Record<string, unknown> | undefined;

function set(patch: Partial<BridgeState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const store = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: (): BridgeState => state,
};

export function setView(view: View): void {
  set({ view });
}

function readHost(ctx: HostContext): HostState {
  const dims = ctx?.containerDimensions as { maxHeight?: number } | undefined;
  const inset = ctx?.safeAreaInsets;
  return {
    theme: ctx?.theme === "dark" ? "dark" : "light",
    maxHeight: typeof dims?.maxHeight === "number" ? dims.maxHeight : undefined,
    insets: { top: inset?.top ?? 0, right: inset?.right ?? 0, bottom: inset?.bottom ?? 0, left: inset?.left ?? 0 },
  };
}

function applyHost(ctx: HostContext): void {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  set({ host: readHost(ctx) });
}

async function showResult(result: ToolResult): Promise<void> {
  const out = interpretResult(result, lastArgs);
  if (out.kind === "view") {
    set({ view: out.view });
    return;
  }
  await openPrompt(out.id, out.initialValues, null);
}

export async function openPrompt(id: string, initialValues: Record<string, string>, back: ListState | null): Promise<void> {
  set({ view: { kind: "loading", label: "Opening prompt..." } });
  try {
    const res = (await app.callServerTool({ name: "get_prompt", arguments: { id } })) as ToolResult;
    if (res.isError) {
      set({ view: { kind: "message", text: textOf(res) || "That prompt is not available.", tone: "error" } });
      return;
    }
    const out = interpretResult(res, undefined);
    if (out.kind === "view" && out.view.kind === "card") {
      set({ view: { ...out.view, initialValues, back } });
      return;
    }
    set({ view: { kind: "message", text: "That prompt is not available.", tone: "error" } });
  } catch {
    set({ view: { kind: "message", text: "Could not load the prompt. Please try again.", tone: "error" } });
  }
}

app.ontoolinput = (params) => {
  lastArgs = params.arguments;
  if (state.view.kind === "loading") set({ view: { kind: "loading", label: "Working..." } });
};
app.ontoolresult = (params) => {
  void showResult(params as unknown as ToolResult);
};
app.onhostcontextchanged = (params) => {
  applyHost({ ...app.getHostContext(), ...params });
};
app.ontoolcancelled = () => {
  set({ view: { kind: "message", text: "The request was cancelled.", tone: "info" } });
};

export async function connect(): Promise<void> {
  try {
    await app.connect();
    applyHost(app.getHostContext());
    set({ connected: true });
  } catch {
    set({ view: { kind: "message", text: "Could not connect to the chat. Reload the conversation to try again.", tone: "error" } });
  }
}

export const host = {
  callTool: (name: string, args: Record<string, unknown>): Promise<ToolResult> =>
    app.callServerTool({ name, arguments: args }) as Promise<ToolResult>,
  sendMessage: (text: string) => app.sendMessage({ role: "user", content: [{ type: "text", text }] }),
  openLink: (url: string) => app.openLink({ url }),
};
