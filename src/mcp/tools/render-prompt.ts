import "server-only";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { renderTemplate } from "@/lib/template";
import { recordUsageEvent } from "@/server/usage";
import { buildOpenLinks } from "../open-links";
import { renderPromptInput } from "../schemas";
import { PROMPT_NOT_FOUND, READ_ANNOTATIONS, errorFrom, errorResult, findPublishedPrompt, okResult, requestIp, requestUserAgent, toolMeta } from "./shared";
import { RENDER_PROMPT_DESCRIPTION } from "../descriptions";

export function registerRenderPrompt(server: Pick<McpServer, "registerTool">): void {
  registerAppTool(
    server,
    "render_prompt",
    {
      title: "Fill in prompt",
      description: RENDER_PROMPT_DESCRIPTION,
      inputSchema: renderPromptInput,
      annotations: READ_ANNOTATIONS,
      _meta: toolMeta({ invoking: "Filling in prompt...", invoked: "Prompt filled in", security: "noauth", widget: "display", widgetAccessible: true }),
    },
    async (args, ctx) => {
      try {
        const found = await findPublishedPrompt(args.id);
        if (!found) return errorResult(PROMPT_NOT_FOUND);
        const { text, missing } = renderTemplate(found.body, found.variables, args.values, { unfilled: "label" });
        const complete = missing.length === 0;

        // Usage stats are best effort and must never break a render. Variable values are never logged or stored.
        try {
          await recordUsageEvent({
            promptId: found.id, type: "render", model: null, source: "mcp",
            userId: typeof ctx.http?.authInfo?.extra?.userId === "string" ? ctx.http.authInfo.extra.userId : null,
            ip: requestIp(ctx), userAgent: requestUserAgent(ctx),
          });
        } catch (e) {
          console.error("[mcp] render usage event failed:", e instanceof Error ? e.name : "unknown error");
        }

        const openLinks = buildOpenLinks(text, found.models).map(({ model, url, prefilled }) => ({ model, url, prefilled }));
        const note = complete
          ? "Filled in prompt:"
          : `Still missing ${missing.length} required value${missing.length === 1 ? "" : "s"} (${missing.join(", ")}); they are shown in [brackets]:`;
        return okResult(`${note}\n\n${text}`, { id: found.shortId, text, missing, complete, openLinks });
      } catch (e) {
        return errorFrom(e, "render_prompt");
      }
    },
  );
}
