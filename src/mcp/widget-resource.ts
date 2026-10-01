import "server-only";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { env } from "@/lib/env";
import { WIDGET_URI } from "./tool-meta";
import { WIDGET_HTML } from "./widget-html.generated";

export { WIDGET_URI };
export const WIDGET_DESCRIPTION =
  "Shows LazyPrompt prompts as cards. Pick a prompt, fill in its variables, and copy it or send it into the chat.";

/** `_meta.ui` for the resource. The widget never fetches: all data arrives through tool results or app.callServerTool. */
export function widgetUiMeta(): { prefersBorder: boolean; csp: { connectDomains: string[]; resourceDomains: string[] }; domain?: string } {
  const domain = env.MCP_WIDGET_DOMAIN;
  return {
    prefersBorder: true,
    csp: { connectDomains: [], resourceDomains: [] },
    ...(domain ? { domain } : {}),
  };
}

export function registerWidgetResource(server: Pick<McpServer, "registerResource">): void {
  registerAppResource(
    server,
    "LazyPrompt prompt widget",
    WIDGET_URI,
    { description: WIDGET_DESCRIPTION, mimeType: RESOURCE_MIME_TYPE },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: RESOURCE_MIME_TYPE,
          text: WIDGET_HTML,
          _meta: { ui: widgetUiMeta(), "openai/widgetDescription": WIDGET_DESCRIPTION },
        },
      ],
    }),
  );
}
