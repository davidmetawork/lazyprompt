# ChatGPT App (Apps SDK) + Claude custom connector: one remote MCP server
Verified 2026-10-01 against live docs, npm and GitHub source.

## 0. Critical correction: package matrix
- `mcp-handler@2.2.0` (npm latest) peer-requires `@modelcontextprotocol/server ^2.0.0` (SDK v2), `zod ^4.2`, Node >= 20. It does NOT work with `@modelcontextprotocol/sdk@1.31.0`.
- The last `mcp-handler` 1.x is 1.1.0, whose peer is the exact pin `@modelcontextprotocol/sdk 1.26.0`. So sdk 1.31.0 + mcp-handler (any version) is a peer conflict.
- Pick ONE stack:
  - **A (recommended, current):** `mcp-handler@^2.2.0 @modelcontextprotocol/server@^2.2.0 @modelcontextprotocol/ext-apps@^2.0.3 zod@^4 next@16`. Verified: ext-apps 2.0.3 peers on `@modelcontextprotocol/{core,client,server} ^2`, so it fits stack A.
  - B (legacy): `mcp-handler@1.1.0 + sdk@1.26.0 + ext-apps@1.x`. Vercel's starters still pin 1.0.7 / sdk 1.25.2 / ext-apps ^1.0.1, i.e. they are stale.
- Stack A vs v1 API: `inputSchema` is a full schema (`z.object({...})`), not a raw shape; only `registerTool/Resource/Prompt`; `extra.authInfo` -> `ctx.http?.authInfo`; `createMcpHandler(init, options)`; handler is stateless, serves spec 2026-07-28 with a Streamable HTTP fallback for 2025-era clients; SSE and Redis removed; route path is arbitrary.
- Import auth types from `@modelcontextprotocol/server` (`AuthInfo`, `OAuthError`, `bearerAuthChallengeResponse`).

## 1. Transport, registration, tools
- Streamable HTTP at a stable HTTPS URL, conventionally `/mcp`; ChatGPT and Claude both connect to it.
- Next.js `app/mcp/route.ts`:
```ts
import { createMcpHandler } from "mcp-handler";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
const handler = createMcpHandler((server) => {
  const URI = "ui://lazyprompt/card.html?v=1";
  registerAppResource(server, "prompt-card", URI, {}, async () => ({
    contents: [{ uri: URI, mimeType: RESOURCE_MIME_TYPE, text: HTML,
      _meta: { ui: { prefersBorder: true, domain: "https://lazyprompt.ai",
        csp: { connectDomains: ["https://lazyprompt.ai"], resourceDomains: [] } } } }] }));
  registerAppTool(server, "search_prompts", {
    title: "Search prompts", description: "Use when the user wants to find public prompts.",
    inputSchema: z.object({ q: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: URI }, "openai/toolInvocation/invoking": "Searching..." },
  }, async ({ q }, ctx) => ({
    content: [{ type: "text", text: "3 prompts found" }],       // model sees
    structuredContent: { items: [] },                            // model AND widget see
    _meta: { fullRows: [] } }));                                 // widget only
}, {});
export { handler as GET, handler as POST };
```
- `registerAppTool` (ext-apps 2.0.3, read from dist) only mirrors `_meta.ui.resourceUri` to the legacy flat key `ui/resourceUri`. It does NOT add `openai/outputTemplate`. ChatGPT honors `_meta.ui.resourceUri`; `openai/outputTemplate` is an optional alias, so add it manually only if the widget doesn't render. `registerAppResource` defaults mimeType to `text/html;profile=mcp-app`.
- **Annotations** (reference page):
  - `readOnlyHint`: true only if no side effects and safe to retry.
  - `destructiveHint`: may delete or overwrite.
  - `openWorldHint`: publishes or reaches outside the user's account.
  - `idempotentHint`: optional.
  - OpenAI marks the first three "Required"; wrong or missing hints are "a common cause of rejection" and each needs justification at submission. Set all three on every tool. Write tools get a confirmation prompt; hints don't replace server-side authorization.
- **Tool `_meta`** (current reference):
  - `ui.resourceUri` (standard).
  - `ui.visibility: ["model","app"]` (default; `["app"]` = widget-only helper tool; `["model"]` = hidden from widget).
  - Legacy `openai/widgetAccessible` (bool; true = `"app"` in visibility).
  - Legacy `openai/visibility` (`public|private`; private = no `"model"`).
  - `openai/toolInvocation/invoking|invoked` (<= 64 chars, ChatGPT only; no MCP Apps equivalent yet).
  - `openai/fileParams`.
  - `securitySchemes` mirror (see section 4).
- **Resource `_meta`:**
  - `ui.prefersBorder`.
  - `ui.csp` = `{connectDomains, resourceDomains, frameDomains?, baseUriDomains?}`. `frameDomains` triggers extra manual review and is rarely approved.
  - `ui.domain`: dedicated origin, **required for submission, unique per app**, default `https://web-sandbox.oaiusercontent.com`.
  - `ui.permissions` (camera, mic, geolocation, clipboard; MCP-only).
  - Legacy aliases: `openai/widgetCSP` (snake_case, plus `redirect_domains`), `openai/widgetDomain`, `openai/widgetPrefersBorder`. `openai/widgetDescription` has no MCP equivalent; keep it.
- ChatGPT sends hint-only `_meta` on tool calls (`openai/locale`, `openai/subject` anonymized user id, `openai/session`, `openai/userLocation`); never use for authorization.

## 2. Widgets
- MIME: **`text/html;profile=mcp-app`** (MCP Apps standard, `ui://` URIs), the default for new apps in both ChatGPT and Claude. Legacy ChatGPT-only: `text/html+skybridge` (still in Vercel's ChatGPT starter). OpenAI says Apps SDK support "is here to stay".
- Deliver HTML as the resource `text`: self-contained (JS/CSS inlined, e.g. `vite-plugin-singlefile`) or referencing CSP-allowed origins. Version the URI (`?v=`) when HTML changes; hosts cache templates.
- Standard bridge: JSON-RPC over postMessage (`ui/notifications/tool-input`, `ui/notifications/tool-result`, `tools/call`, `ui/message`, `ui/update-model-context`). Use `App` from `@modelcontextprotocol/ext-apps` (`/react` has `useApp`). Register handlers BEFORE `await app.connect()`. `connect()` auto-detects the OpenAI environment, so one bundle can run in both hosts.
- Mapping `window.openai` to MCP Apps (apps.extensions.modelcontextprotocol.io migrate doc):

| window.openai | MCP Apps |
|---|---|
| `toolInput` | `app.ontoolinput` (`params.arguments`) |
| `toolOutput` (= structuredContent) | `app.ontoolresult` (`params.structuredContent`) |
| `toolResponseMetadata` (= `_meta`) | `params._meta` in `ontoolresult` |
| `callTool(name,args)` | `app.callServerTool({name,arguments})` |
| `sendFollowUpMessage({prompt})` | `app.sendMessage({role:"user",content:[{type:"text",text}]})` |
| `openExternal({href})` | `app.openLink({url})` |
| `requestDisplayMode({mode})` | `app.requestDisplayMode({mode})` (check `getHostContext().availableDisplayModes`) |
| `theme/locale/displayMode/maxHeight/safeArea` | `app.getHostContext()` (`theme`, `locale`, `displayMode`, `viewport.maxHeight`, `safeAreaInsets`), `onhostcontextchanged` |
| `widgetState/setWidgetState` | NONE (use `app.updateModelContext`, localStorage, or server state) |
| `requestModal`, `requestClose`, `uploadFile`, `getFileDownloadUrl` | not yet in MCP Apps (`notifyIntrinsicHeight` -> auto-resize) |

- `window.openai` extras (ChatGPT only): `widgetState` is per widget instance, is sent to the model (keep < ~4k tokens); `callTool` needs `"app"` visibility on the target tool; globals update via the `openai:set_globals` event.
- Client support: Claude (web + desktop) and ChatGPT both render MCP Apps (GA 2026-01-26); also Goose, VS Code Insiders. Claude ignores `openai/*` keys and asks the user to allow the app display.

## 3. What the model sees
- `structuredContent`: model AND widget; must match `outputSchema` if declared. `content`: model AND widget (text for narration). `_meta`: widget only, hidden from the model.
- Only `structuredContent` and `content` enter the transcript; `_meta` is hidden from the model but is not secret storage. Keep structuredContent concise. Submission rule: no telemetry/trace/session ids or timestamps in results unless required.

## 4. Authentication (OAuth 2.1 per MCP authorization spec)
- Resource server (our MCP) must serve RFC 9728 PRM: `/.well-known/oauth-protected-resource` (also try the path-suffixed `/.well-known/oauth-protected-resource/mcp`). Fields: `resource` (must equal the MCP URL exactly as entered, path included), `authorization_servers` (Claude uses ONLY the first entry), `scopes_supported`, `bearer_methods_supported`.
- Unauthenticated protected call: `401` + `WWW-Authenticate: Bearer resource_metadata="https://lazyprompt.ai/.well-known/oauth-protected-resource", scope="..."` (+ `error`, `error_description`).
- AS metadata (RFC 8414 or OIDC) must have `authorization_endpoint`, `token_endpoint`, and `code_challenge_methods_supported: ["S256"]` (ChatGPT refuses otherwise). The AS must echo the `resource` param into the token (`aud`). Token endpoint must accept `application/x-www-form-urlencoded`. Verify iss/aud/exp/scope on every call.
- Client registration:
  - ChatGPT: DCR today (`registration_endpoint`), PKCE S256; NO client_credentials, API keys or mTLS. Docs call CIMD "still in draft" though newer plugin-auth docs show `client_id_metadata_document_supported`; support both.
  - Claude: DCR and CIMD out of the box. It picks CIMD only if AS metadata has BOTH `client_id_metadata_document_supported: true` AND `"none"` in `token_endpoint_auth_methods_supported`; otherwise DCR.
  - The MCP 2026-07-28 spec deprecates DCR in favor of CIMD.
- Redirect URIs to allowlist:
  - ChatGPT: `https://chatgpt.com/connector/oauth/{callback_id}` (shown in app management), legacy `https://chatgpt.com/connector_platform_oauth_redirect`, review `https://platform.openai.com/apps-manage/oauth`.
  - Claude: `https://claude.ai/api/mcp/auth_callback`; Claude Code: loopback `http://localhost/callback`, `http://127.0.0.1/callback` (port ignored).
- Claude limits: 10 s for discovery/register/token, 30 s for refresh; rotate refresh tokens, return `invalid_grant`; the AS must be reachable from `160.79.104.0/21` (WAFs break the flow). ChatGPT egress: openai.com/chatgpt-connectors.json.
- **Mixed anonymous reads + authed writes:**
  - Declare per tool, ChatGPT: public `securitySchemes: [{type:"noauth"}]` (or `[noauth, oauth2]` for optional auth); write tools `securitySchemes: [{type:"oauth2", scopes:["prompts.write"]}]`. Also mirror them in `_meta.securitySchemes` (back-compat). OpenAI's examples pass `securitySchemes` at the top level of `registerAppTool` config, which the SDK may reject: verify against the v2 types.
  - ChatGPT linking UI needs BOTH securitySchemes+PRM AND a tool result with `isError:true` and `_meta["mcp/www_authenticate"]: ['Bearer resource_metadata="...", error="insufficient_scope", error_description="Sign in"']` (value must have `error` and `error_description`).
  - **Claude does the opposite:** it only starts sign-in on an HTTP-level `401` + `WWW-Authenticate` for a `tools/call`. A 200 with `isError:true` shows no Connect card. A 403 works only with `error="insufficient_scope"` (step-up). `initialize` and `tools/list` must stay anonymous.
  - Therefore gate in the HTTP layer BEFORE the SDK, and ALSO emit the ChatGPT `_meta` result in the handler as the fallback path.
- `mcp-handler` auth:
```ts
import { withMcpAuth, protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { bearerAuthChallengeResponse, OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
const PROTECTED = new Set(["save_prompt"]);
const authed = withMcpAuth(handler, verifyToken, { required: false, resourceMetadataPath: "/.well-known/oauth-protected-resource", resourceUrl: "https://lazyprompt.ai" });
export async function POST(req: Request) {
  const body = await req.clone().json().catch(() => null);
  const calls = (Array.isArray(body) ? body : [body]).filter(m => m?.method === "tools/call");
  if (calls.some(m => PROTECTED.has(m.params?.name)) && !(await verifyToken(req, bearer(req))))
    return bearerAuthChallengeResponse(new OAuthError(OAuthErrorCode.InvalidToken, "Authentication required"),
      { requiredScopes: ["prompts.write"], resourceMetadataUrl: "https://lazyprompt.ai/.well-known/oauth-protected-resource" });
  return authed(req);
}
// app/.well-known/oauth-protected-resource/route.ts
export const GET = protectedResourceHandler({ authServerUrls: ["https://auth.lazyprompt.ai"], resourceUrl: "https://lazyprompt.ai/mcp" });
export const OPTIONS = metadataCorsOptionsRequestHandler();
```
  - `withMcpAuth(handler, verifyToken(req, bearerToken?), {required=false, requiredScopes, resourceMetadataPath, resourceUrl})` is verified from source:
    - `required:false` passes anonymous requests through with `req.auth` unset.
    - Scope and expiry are only checked when a token IS present.
    - Failures: 401 `invalid_token` / 403 `insufficient_scope` with `resource_metadata` challenge.
    - In tools, read `ctx.http?.authInfo`. Never log or return `authInfo.token`.
  - `protectedResourceHandler` derives `resource` from the request path (stripping `/.well-known/<x>`), so for a `/mcp` endpoint pass `resourceUrl` explicitly. `generateProtectedResourceMetadata` accepts `additionalMetadata` (e.g. `scopes_supported`).
  - OpenAI strongly recommends an established IdP (Auth0, Stytch, etc.) as the AS.

## 5. Submission, policies, testing
- **Dev-mode testing:** ChatGPT Settings -> Apps & Connectors -> Advanced -> Developer mode (org may block), then Create connector (name, description, `/mcp` URL). Use ngrok or Cloudflare Tunnel locally. After changing tools or descriptions, click Refresh on the connector. Mobile web/app inherits the link.
- **Other clients:** platform.openai.com/playground (Tools -> Add -> MCP Server); `npx @modelcontextprotocol/inspector@latest` (Streamable HTTP, Auth tab walks OAuth, renders widgets); Claude: Customize -> Connectors -> Add custom connector, or `claude mcp add --transport http`.
- **ChatGPT directory prerequisites:**
  - Verified individual/business org with Owner role (or `api.apps.write`); submit at platform.openai.com/apps-manage.
  - Public HTTPS MCP server (no local/test endpoint); CSP lists exact fetched domains; `_meta.ui.domain` set; OAuth metadata entered in the form.
  - Global-residency project (EU residency can't submit); one version in review at a time.
  - After publish, tool names, signatures and descriptions are LOCKED; changes need resubmission.
- **Policy highlights:**
  - Privacy policy required (data categories, purposes, recipients, controls).
  - Support contact required.
  - Authenticated apps must supply a demo login with sample data (no signup, no inaccessible 2FA).
  - Complete product, not a demo/trial.
  - No generic single-word names; accurate tool descriptions, no "prefer this app" language; minimal inputs (no chat history, precise location, credentials).
  - Commerce: physical goods only via external checkout; no digital goods, subscriptions, credits or ads (matters for any LazyPrompt paid tier). No scraping or unofficial connectors; suitable for ages 13+.
- **Claude directory:** submission portal (auth types `oauth_dcr|oauth_cimd|oauth_anthropic_creds|none|static_headers`); mcp-review@anthropic.com. Custom connectors need no review.

## 6. Next.js integration
- Vercel templates `vercel-labs/chatgpt-apps-sdk-nextjs-starter` (skybridge, `openai/*`) and `vercel-labs/mcp-apps-nextjs-starter` (MCP Apps) use `mcp-handler` and self-fetch the rendered page (`fetch(baseURL + "/")`) as widget HTML.
- Gotchas (starters + Vercel blog "Running Next.js inside ChatGPT"):
  - The iframe origin is `*.oaiusercontent.com` (or `ui.domain`), not our server, so every relative URL breaks.
  - `next.config.ts` -> `assetPrefix: baseURL`.
  - `baseUrl.ts`: `BASE_URL` env, else localhost in dev, else `VERCEL_PROJECT_PRODUCTION_URL` (prod) / `VERCEL_BRANCH_URL` / `VERCEL_URL`.
  - `middleware.ts` returns permissive CORS (`Access-Control-Allow-Origin: *`) plus OPTIONS 204 on `/:path*`. This is needed for `_next/static` and RSC fetches from the iframe. Next 16 may prefer `proxy.ts`; verify.
  - Root layout patches `window.fetch` (rewrite same-origin to `baseURL`), history pushState/replaceState and `<base href>`.
  - CSP `connectDomains` and `resourceDomains` must include `baseURL`.
- **Recommendation (opinion):** don't SSR the app page into the widget. Build a standalone widget bundle (Vite singlefile) using `App` from ext-apps, inline it as the resource `text`, and use `connectDomains` only for API calls. This removes assetPrefix/CORS/fetch patching and works unchanged in Claude. Keep `/mcp`, `/.well-known/*` and OAuth routes as normal route handlers (`dynamic = "force-dynamic"`).

## Uncertain
- Whether ChatGPT also starts linking on an HTTP 401 `tools/call` (docs only document the `_meta["mcp/www_authenticate"]` result path). Test both on a dev-mode connector; if a 401 breaks ChatGPT, branch on `clientInfo.name` or User-Agent.
- Whether v2 `registerAppTool` config types accept a top-level `securitySchemes`; fall back to `_meta.securitySchemes` (documented mirror).
- ChatGPT still accepts `text/html+skybridge`, but this is not a stated guarantee. MCP Apps mime is the documented default.
- OpenAI is migrating docs to `developers.openai.com/plugins/...` ("Apps" vs "Plugins" naming); some apps-sdk URLs 301.
- mcp-handler 2.x stateless mode with widget-initiated `tools/call` and ext-apps 2.0.3 was not run end-to-end here (only package metadata and source were checked).
- Next 16 `middleware` vs `proxy` file convention.

## Sources
developers.openai.com/apps-sdk/{reference,build/*,deploy/*,app-submission-guidelines}; apps.extensions.modelcontextprotocol.io (migrate-openai-app); blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps; claude.com/docs/connectors/building/{authentication,lazy-authentication,mcp-apps}; github.com/vercel/mcp-handler; github.com/vercel-labs/{chatgpt-apps-sdk-nextjs-starter,mcp-apps-nextjs-starter}; npm registry.
