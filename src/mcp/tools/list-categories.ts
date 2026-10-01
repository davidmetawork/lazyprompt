import "server-only";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { listCategories } from "@/server/taxonomy";
import { toCategoryResult } from "../mappers";
import { listCategoriesInput } from "../schemas";
import { READ_ANNOTATIONS, errorFrom, okResult, toolMeta } from "./shared";
import { LIST_CATEGORIES_DESCRIPTION } from "../descriptions";

export function registerListCategories(server: Pick<McpServer, "registerTool">): void {
  registerAppTool(
    server,
    "list_categories",
    {
      title: "List categories",
      description: LIST_CATEGORIES_DESCRIPTION,
      inputSchema: listCategoriesInput,
      annotations: READ_ANNOTATIONS,
      _meta: toolMeta({ invoking: "Loading categories...", invoked: "Categories loaded", security: "noauth" }),
    },
    async () => {
      try {
        const categories = (await listCategories()).map(toCategoryResult);
        const text = `LazyPrompt has ${categories.length} categories:\n${categories.map((c) => `- ${c.slug}: ${c.name} (${c.promptCount} prompts)`).join("\n")}`;
        return okResult(text, { categories });
      } catch (e) {
        return errorFrom(e, "list_categories");
      }
    },
  );
}
