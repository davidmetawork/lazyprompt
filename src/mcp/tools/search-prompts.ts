import "server-only";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { listPrompts } from "@/server/prompts/queries";
import { toSearchResult } from "../mappers";
import { searchPromptsInput } from "../schemas";
import { READ_ANNOTATIONS, errorFrom, okResult, toolMeta } from "./shared";
import { SEARCH_PROMPTS_DESCRIPTION } from "../descriptions";

export function registerSearchPrompts(server: Pick<McpServer, "registerTool">): void {
  registerAppTool(
    server,
    "search_prompts",
    {
      title: "Search prompts",
      description: SEARCH_PROMPTS_DESCRIPTION,
      inputSchema: searchPromptsInput,
      annotations: READ_ANNOTATIONS,
      _meta: toolMeta({ invoking: "Searching LazyPrompt...", invoked: "Found prompts", security: "noauth", widget: "display" }),
    },
    async (args) => {
      try {
        const page = await listPrompts({
          q: args.query,
          category: args.category,
          model: args.model,
          sort: args.sort ?? (args.query ? "relevance" : "top"),
          page: 1,
          pageSize: args.limit,
        });
        const results = page.items.map(toSearchResult);
        const subject = args.query ? ` for '${args.query}'` : "";
        const header = results.length === 0
          ? `No prompts found${subject}. Try different words, or use list_categories to browse.`
          : `Found ${results.length} prompt${results.length === 1 ? "" : "s"}${subject}${page.total > results.length ? ` (${page.total} match in total)` : ""}:`;
        const lines = results.map((r, i) =>
          `${i + 1}. ${r.title} (id: ${r.id}) - ${r.rating === null ? "not rated yet" : `${r.rating}/5 from ${r.ratingCount}`}, ${r.variableCount} variable${r.variableCount === 1 ? "" : "s"} - ${r.url}`);
        return okResult([header, ...lines].join("\n"), { query: args.query ?? null, total: page.total, results });
      } catch (e) {
        return errorFrom(e, "search_prompts");
      }
    },
  );
}
