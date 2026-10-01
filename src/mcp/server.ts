import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerGetPrompt } from "./tools/get-prompt";
import { registerListCategories } from "./tools/list-categories";
import { registerRatePrompt } from "./tools/rate-prompt";
import { registerRenderPrompt } from "./tools/render-prompt";
import { registerSavePrompt } from "./tools/save-prompt";
import { registerSearchPrompts } from "./tools/search-prompts";
import { registerWidgetResource } from "./widget-resource";

export interface LazyPromptServerOptions { oauthEnabled: boolean; baseUrl: string }

export const SERVER_INSTRUCTIONS =
  "LazyPrompt is a free community library of AI prompts. Search it, open a prompt, fill in its variables and use the result. " +
  "LazyPrompt never runs a prompt itself.";

/** Registers the widget resource and every tool. Write tools exist only when OAuth is enabled. */
export function registerLazyPromptTools(server: McpServer, opts: LazyPromptServerOptions): void {
  registerWidgetResource(server);
  registerSearchPrompts(server);
  registerGetPrompt(server);
  registerRenderPrompt(server);
  registerListCategories(server);
  if (opts.oauthEnabled) {
    registerRatePrompt(server, opts);
    registerSavePrompt(server, opts);
  }
}
