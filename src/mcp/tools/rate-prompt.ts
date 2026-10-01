import "server-only";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { ratePrompt } from "@/server/ratings";
import { roundRating } from "../mappers";
import { ratePromptInput } from "../schemas";
import { PROMPT_NOT_FOUND, errorFrom, errorResult, findPublishedPrompt, okResult, requireWriteViewer, toolMeta, type McpToolOptions } from "./shared";
import { RATE_PROMPT_DESCRIPTION } from "../descriptions";

export function registerRatePrompt(server: Pick<McpServer, "registerTool">, opts: McpToolOptions): void {
  registerAppTool(
    server,
    "rate_prompt",
    {
      title: "Rate prompt",
      description: RATE_PROMPT_DESCRIPTION,
      inputSchema: ratePromptInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
      _meta: toolMeta({ invoking: "Saving your rating...", invoked: "Rating saved", security: "oauth", widgetAccessible: true }),
    },
    async (args, ctx) => {
      try {
        const auth = await requireWriteViewer(ctx, opts.baseUrl);
        if ("result" in auth) return auth.result;
        const found = await findPublishedPrompt(args.id);
        if (!found) return errorResult(PROMPT_NOT_FOUND);
        const summary = await ratePrompt(auth.viewer, found.id, args.stars);
        const rating = roundRating(summary.ratingAvg);
        return okResult(
          `Saved your ${args.stars}-star rating for "${found.title}". It now averages ${rating ?? "n/a"} from ${summary.ratingCount} rating${summary.ratingCount === 1 ? "" : "s"}.`,
          { id: found.shortId, yourRating: summary.viewerRating ?? args.stars, rating, ratingCount: summary.ratingCount },
        );
      } catch (e) {
        return errorFrom(e, "rate_prompt");
      }
    },
  );
}
