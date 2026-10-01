// MCP server for the ChatGPT App and Claude connector (ARCHITECTURE.md section 12). Bearer-only: this route never reads cookies.
import { handleMcpOptions, handleMcpOther, handleMcpPost } from "@/mcp/pipeline";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handleMcpOther(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleMcpPost(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return handleMcpOther(req);
}

export async function OPTIONS(): Promise<Response> {
  return handleMcpOptions();
}
