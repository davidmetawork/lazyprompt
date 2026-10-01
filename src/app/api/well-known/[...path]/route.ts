// /.well-known/* is rewritten here by next.config (ARCHITECTURE.md section 12). OAuth discovery documents are PROXIED from
// Better Auth so `resource` always equals the token audience and the AS metadata is never hand-maintained.
import { generateProtectedResourceMetadata } from "mcp-handler";
import { auth } from "@/auth/server";
import { getBaseUrl } from "@/lib/base-url";
import { MCP_SCOPES } from "@/mcp/oauth-metadata";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60", ...CORS },
  });
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json", ...CORS } });
}

/** Calls Better Auth in-process (no cookies, no incoming headers) and returns its JSON body when it answers 200. */
async function fromAuth(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await auth.handler(new Request(url));
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function protectedResource(base: string): Promise<Record<string, unknown>> {
  const resource = `${base}/mcp`;
  // The mcp() plugin serves RFC 9728 metadata for the resource; Better Auth 1.7.7 answers on the bare well-known path.
  for (const url of [`${base}/.well-known/oauth-protected-resource`, `${base}/api/auth/.well-known/oauth-protected-resource`]) {
    const body = await fromAuth(url);
    if (body && body.resource === resource) return body;
  }
  return {
    ...generateProtectedResourceMetadata({ authServerUrls: [`${base}/api/auth`], resourceUrl: resource }),
    scopes_supported: MCP_SCOPES.filter((s) => s.startsWith("prompts:")),
    bearer_methods_supported: ["header"],
  };
}

type Params = { params: Promise<{ path: string[] }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const path = (await params).path.join("/");
  const base = getBaseUrl();
  switch (path) {
    case "oauth-protected-resource":
    case "oauth-protected-resource/mcp":
      return json(await protectedResource(base));
    case "oauth-authorization-server":
    case "oauth-authorization-server/api/auth": {
      const body = await fromAuth(`${base}/api/auth/.well-known/oauth-authorization-server`);
      return body ? json(body) : json({ error: "temporarily_unavailable" }, 503);
    }
    case "openid-configuration":
    case "openid-configuration/api/auth": {
      const body = await fromAuth(`${base}/api/auth/.well-known/openid-configuration`);
      return body ? json(body) : json({ error: "temporarily_unavailable" }, 503);
    }
    default:
      return notFound();
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}
