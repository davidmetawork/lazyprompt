import "server-only";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { toPromptResult } from "../mappers";
import { getPromptInput } from "../schemas";
import { PROMPT_NOT_FOUND, READ_ANNOTATIONS, errorFrom, errorResult, findPublishedPrompt, okResult, toolMeta } from "./shared";
import { GET_PROMPT_DESCRIPTION } from "../descriptions";

export function registerGetPrompt(server: Pick<McpServer, "registerTool">): void {
  registerAppTool(
    server,
    "get_prompt",
    {
      title: "Get prompt",
      description: GET_PROMPT_DESCRIPTION,
      inputSchema: getPromptInput,
      annotations: READ_ANNOTATIONS,
      _meta: toolMeta({ invoking: "Opening prompt...", invoked: "Prompt ready", security: "noauth", widget: "display", widgetAccessible: true }),
    },
    async (args) => {
      try {
        const found = await findPublishedPrompt(args.id);
        if (!found) return errorResult(PROMPT_NOT_FOUND);
        const prompt = toPromptResult(found);
        const vars = prompt.variables.length === 0
          ? "No variables."
          : `Variables: ${prompt.variables.map((v) => `${v.key}${v.required ? "" : " (optional)"}`).join(", ")}.`;
        const text = `${prompt.title} (id: ${prompt.id}, ${prompt.rating === null ? "not rated yet" : `${prompt.rating}/5 from ${prompt.ratingCount}`})\n${vars}\n\n${prompt.body}\n\n${prompt.url}`;
        return okResult(text, { prompt });
      } catch (e) {
        return errorFrom(e, "get_prompt");
      }
    },
  );
}
