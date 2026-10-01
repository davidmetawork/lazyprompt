import "server-only";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { setSaved } from "@/server/saves";
import { savePromptInput } from "../schemas";
import { PROMPT_NOT_FOUND, errorFrom, errorResult, findPublishedPrompt, okResult, requireWriteViewer, toolMeta, type McpToolOptions } from "./shared";
import { SAVE_PROMPT_DESCRIPTION } from "../descriptions";

export function registerSavePrompt(server: Pick<McpServer, "registerTool">, opts: McpToolOptions): void {
  registerAppTool(
    server,
    "save_prompt",
    {
      title: "Save prompt",
      description: SAVE_PROMPT_DESCRIPTION,
      inputSchema: savePromptInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: toolMeta({ invoking: "Saving prompt...", invoked: "Prompt saved", security: "oauth", widgetAccessible: true }),
    },
    async (args, ctx) => {
      try {
        const auth = await requireWriteViewer(ctx, opts.baseUrl);
        if ("result" in auth) return auth.result;
        const found = await findPublishedPrompt(args.id);
        if (!found) return errorResult(PROMPT_NOT_FOUND);
        const res = await setSaved(auth.viewer, found.id, true);
        return okResult(`Saved "${found.title}" to your LazyPrompt saved list.`, { id: found.shortId, saved: true, saveCount: res.saveCount });
      } catch (e) {
        return errorFrom(e, "save_prompt");
      }
    },
  );
}
