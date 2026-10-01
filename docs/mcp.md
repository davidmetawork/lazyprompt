# LazyPrompt MCP server (ChatGPT App and Claude connector)

Operator guide. The design contract is `docs/ARCHITECTURE.md` section 12; this file covers running, testing and publishing it.

The same Next.js app serves an MCP server at `/mcp` (Streamable HTTP, stateless). ChatGPT uses it as an App (Apps SDK / MCP Apps), Claude uses it as a custom connector. LazyPrompt never runs a prompt: tools only find, fill in and hand over text.

## What is where

| path | what |
|---|---|
| `src/app/mcp/route.ts` | GET / POST / DELETE / OPTIONS. Thin wrappers over `src/mcp/pipeline.ts` |
| `src/mcp/pipeline.ts` | POST pipeline: 64 KB cap, rate limits, challenge mode, `withMcpAuth` |
| `src/mcp/server.ts` | `registerLazyPromptTools(server, { oauthEnabled, baseUrl })` |
| `src/mcp/tools/*.ts`, `src/mcp/descriptions.ts`, `src/mcp/schemas.ts` | the six tools, their (locked) descriptions and zod input schemas |
| `src/mcp/auth.ts`, `src/mcp/claims.ts` | `verifyToken` and the verification config shared with the HTTP gate |
| `src/mcp/widget-resource.ts`, `widget/`, `src/mcp/widget-html.generated.ts` | widget resource, widget source, committed build output |
| `src/app/api/well-known/[...path]/route.ts` | `/.well-known/*` (rewritten by `next.config.ts`) |
| `src/auth/mcp-plugins.ts` | Better Auth `jwt()`, `mcp()`, `cimd()` plugins |
| `src/app/(site)/oauth/{sign-in,consent}` | OAuth login wrapper and consent screen |
| `src/app/(site)/apps` | public how-to page |

Tools: `search_prompts`, `get_prompt`, `render_prompt`, `list_categories` (always), and `rate_prompt`, `save_prompt` (only when `MCP_OAUTH_ENABLED=true`).

## Local testing with the MCP Inspector

```bash
pnpm dev                                   # http://localhost:3000
npx @modelcontextprotocol/inspector@latest # opens the Inspector UI
```

In the Inspector choose transport **Streamable HTTP**, URL `http://localhost:3000/mcp`, then Connect, List Tools, and call `search_prompts`. Use another port with `PORT=3206 pnpm dev -p 3206` (the base URL follows `PORT`).

Headless check (no UI), same client library:

```bash
npx @modelcontextprotocol/inspector@latest --cli http://localhost:3000/mcp --transport http --method tools/list
npx @modelcontextprotocol/inspector@latest --cli http://localhost:3000/mcp --transport http \
  --method tools/call --tool-name get_prompt --tool-arg id=<7-char id>
```

Plain curl also works (responses are Server-Sent Events):

```bash
curl -s localhost:3000/mcp -X POST -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_prompts","arguments":{"query":"cold email"}}}'
```

### The widget

`resources/read` on `ui://lazyprompt/prompt-widget.html?v=<hash>` returns the widget (`text/html;profile=mcp-app`). `search_prompts` shows a result list; `get_prompt` and `render_prompt` show a card with the variable form, a live preview, and the buttons Use in chat, Copy, Open on LazyPrompt, Rate and Save. The widget follows the host's theme and maximum height, never fetches anything (CSP `connectDomains` and `resourceDomains` are empty) and only talks to the host through `app.callServerTool`, `app.sendMessage` and `app.openLink`.

Rebuild after editing `widget/`:

```bash
pnpm widget:build   # builds widget/ into one HTML file and rewrites src/mcp/widget-html.generated.ts
```

The generated file is committed and CI fails on a diff. `WIDGET_VERSION` (a hash) is part of the resource URI, so hosts refetch the widget when it changes.

Size: React 19 alone is about 186 KB raw, so the spec's 200 KB budget is measured **gzipped** (currently about 125 KB gzipped, 434 KB raw). If a raw 200 KB limit is ever required, the options are Preact via a Vite alias, or dropping React for plain DOM.

## Testing from ChatGPT (developer mode)

ChatGPT needs a public HTTPS URL, so tunnel your local server.

```bash
cloudflared tunnel --url http://localhost:3000     # prints https://<random>.trycloudflare.com
BETTER_AUTH_URL=https://<random>.trycloudflare.com pnpm dev
```

`BETTER_AUTH_URL` matters: the OAuth `resource`, the token audience, the issuer and every `url` in tool results are derived from `getBaseUrl()`, and `BETTER_AUTH_URL` is its first source. Restart the dev server after changing it. Quick tunnels get a new hostname every run, so repeat the connector setup each time.

1. ChatGPT: Settings, Apps & Connectors, Advanced settings, turn on **Developer mode** (a workspace admin can block it).
2. **Create** (connector), name it LazyPrompt, set the URL to `https://<random>.trycloudflare.com/mcp`, save.
3. Start a chat, add LazyPrompt from the tools menu, and ask for a prompt.
4. **After changing tool names, descriptions, schemas or the widget, open the connector's settings and press Refresh.** ChatGPT caches the tool list and widget.

## Testing from Claude

- Claude apps: Settings, Connectors, **Add custom connector**, paste `https://<host>/mcp`.
- Claude Code: `claude mcp add --transport http lazyprompt https://<host>/mcp` (for local testing `http://localhost:3000/mcp` works with Claude Code).

Claude starts sign-in only from an HTTP `401` with a `WWW-Authenticate` header, so use `MCP_AUTH_CHALLENGE=auto` or `http401` for it (see below).

## Enabling OAuth (rate and save)

OAuth is optional. Without it the read tools work and the widget's Rate and Save buttons send people to the site. To enable the write tools:

1. Set `MCP_OAUTH_ENABLED=true` and (optionally) `MCP_AUTH_CHALLENGE`, then restart. The OAuth tables already exist in migration `0001_init`; there is no extra migration. The Better Auth plugins are always installed, so the metadata endpoints answer even when the flag is off.
2. Check discovery:
   - `GET /.well-known/oauth-protected-resource` returns `resource: <base>/mcp` and `authorization_servers: [<base>/api/auth]`. It is proxied from Better Auth, so it always equals the token audience.
   - `GET /.well-known/oauth-authorization-server` advertises `code_challenge_methods_supported: ["S256"]` and a `registration_endpoint` (dynamic client registration), and `client_id_metadata_document_supported`.
3. Connect from a client. The flow is: unauthenticated write call, challenge, `/api/auth/oauth2/authorize`, `/oauth/sign-in` (magic link or social), `/oauth/consent`, token (JWT, audience `<base>/mcp`, scope `prompts:write`).

### Choosing `MCP_AUTH_CHALLENGE`

| value | unauthenticated `rate_prompt` / `save_prompt` | use for |
|---|---|---|
| `auto` (default) | `result` when the `User-Agent` contains `openai` or `chatgpt`, otherwise `http401` | one deployment serving both ChatGPT and Claude |
| `http401` | HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="<base>/.well-known/oauth-protected-resource/mcp", scope="prompts:write"` from `@better-auth/mcp`'s `createMcpProtectedRequestHandler`. A token without `prompts:write` gets 403 `insufficient_scope` | Claude |
| `result` | HTTP 200, `isError: true`, `_meta["mcp/www_authenticate"] = ['Bearer resource_metadata="<base>/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Sign in to LazyPrompt"']` | ChatGPT |

`initialize`, `tools/list`, `resources/*` and the read tools are always anonymous. The `resource_metadata` URL in the 401 challenge is the RFC 9728 path-suffixed form; both forms are served.

If sign-in does not start in ChatGPT, force `result`; if it does not start in Claude, force `http401`. Both clients need the tools' `_meta.securitySchemes` (set) and a reachable PRM document.

### Token verification

`createMcpProtectedRequestHandler` verifies the JWT against `<base>/api/auth/jwks` (issuer `<base>/api/auth`, audience `<base>/mcp`). `verifyToken` in `src/mcp/auth.ts` runs the same verification (it captures the verified claims from that handler). The issuer and JWKS URL are read once from Better Auth's own authorization-server metadata, with `<base>/api/auth` as the fallback.

Verification fetches the JWKS **over HTTP from the public URL** (the library caches it for 5 minutes per instance). This is fine in production. Roles and bans are never taken from the token: write tools call `getViewerById(sub)` and reject banned users.

### Redirect URIs

Clients register their own redirect URIs (DCR or CIMD). The usual ones, also listed on `/apps`:

- ChatGPT: `https://chatgpt.com/connector/oauth/<callback_id>`, legacy `https://chatgpt.com/connector_platform_oauth_redirect`, review `https://platform.openai.com/apps-manage/oauth`
- Claude: `https://claude.ai/api/mcp/auth_callback`
- Claude Code: `http://localhost/callback`, `http://127.0.0.1/callback` (any port)

### Sign-in continuation (why `/oauth/sign-in` exists)

Better Auth resumes an authorize request after a **social** sign-in by itself, but not after a **magic link**, which completes in a separate request. `loginPage` therefore points to `/oauth/sign-in`, which passes the rebuilt authorize URL as the magic link's `callbackURL`. The stock `/sign-in` page (its `next` is capped at 512 characters) is untouched.

### Manual end-to-end check

A scripted run against a local server (flag on) was verified: dynamic registration, authorize, redirect to `/oauth/sign-in`, magic link, automatic continuation to `/oauth/consent`, approve, code exchange with PKCE and `resource`, then `rate_prompt` / `save_prompt` with the bearer token reaching the data layer. You can do the same with the Inspector's **Auth** tab (Streamable HTTP, URL `<base>/mcp`, set `MCP_OAUTH_ENABLED=true`).

## Preview deployments (Vercel)

- `resource`, the token `aud`, the issuer and result URLs are bound to `getBaseUrl()`, which on a preview is `https://$VERCEL_BRANCH_URL`. **Add the connector with the stable BRANCH URL (`https://<branch-url>/mcp`), never a per-deployment URL** (`<project>-<hash>-<team>.vercel.app`), or token audience checks fail.
- **Vercel Authentication (deployment protection)** blocks external callers, including ChatGPT and Claude, and also the server's own JWKS fetch. Turn it off for the branch you test (or use a protection bypass), otherwise the connector cannot connect and OAuth fails.
- **Vercel crons do not run on previews**, so rankings and trust levels do not update there; `/api/cron/recompute` can be called by hand with `CRON_SECRET`.
- Register the preview's callback URLs for GitHub/Google sign-in if you test those.

## Operating notes

- **Rate limits** (`mcp` in `src/server/rate-limit.ts`): 120 requests per minute per subject, plus 600 per minute per IP hash. The subject is the verified token's user id, else the client-supplied `params._meta["openai/subject"]` (capped at 128 chars), else the IP hash. It is for limiting only, never for authorization. Over the limit: HTTP 429, JSON-RPC error, `Retry-After`. ChatGPT and Claude share egress IPs, which is why the per-IP limit alone would be too strict. GET and DELETE go through the same gates as POST. Before any bearer token is verified, the IP's count of FAILED verifications (`mcp:auth:<ip hash>`, 600 per minute) is read, and an IP over it is refused with 429; only failed verifications increment it, so valid tokens behind a shared egress IP never use it up.
- **Untrusted text**: prompt bodies, notes and example outputs are community-authored. `get_prompt` and `render_prompt` wrap them in `<community_content>` (after "Untrusted community text follows.") and the server instructions tell the model to treat them as data, never to call `rate_prompt` or `save_prompt` because a prompt says so. `render_prompt` leaves skipped optional variables out of the text instead of printing `[Label]`.
- **Body size**: more than 64 KB gives HTTP 413.
- **Privacy**: tool results contain no timestamps, emails, session ids or tokens. Variable values given to `render_prompt` are used to build the text only; they are never logged or stored. `render_prompt` records one usage event (source `mcp`, actor = hashed IP; the user id when signed in). The route never reads cookies.
- **Usage events** are best effort: a failing `recordUsageEvent` never fails a render.

## Directory submission checklist

ChatGPT App directory and Claude connector directory. Tool names, signatures and descriptions are **locked after publication**; changing them means a new submission.

- [ ] Public HTTPS production URL (`https://lazyprompt.ai/mcp`), not a tunnel or preview.
- [ ] Final tool names and descriptions reviewed (`src/mcp/descriptions.ts`): accurate, no "prefer this app" language, no promotion.
- [ ] All tools carry `readOnlyHint`, `destructiveHint`, `openWorldHint` and `idempotentHint`, each justified in the form (write tools: rating changes a public aggregate, hence `openWorldHint: true` on `rate_prompt`; `render_prompt` records a usage event, hence `readOnlyHint: false`, `openWorldHint: true`).
- [ ] `MCP_WIDGET_DOMAIN` set to the dedicated, unique widget origin (becomes `_meta.ui.domain`); widget CSP lists no domains because it fetches nothing.
- [ ] Privacy policy URL (data categories, purposes, recipients, controls): `/privacy`.
- [ ] Support contact and terms (`/terms`), a DMCA/takedown contact (`/guidelines`).
- [ ] If OAuth is on: a **demo account** with sample data, no signup and no inaccessible 2FA (the magic link needs a reachable inbox, so provide a mailbox the reviewers can read, or an admin-created session); OAuth metadata entered in the form; allowlist the ChatGPT and Claude redirect URIs.
- [ ] Verified organization with the Owner role, global-residency project, one version in review at a time (ChatGPT).
- [ ] Tested in ChatGPT developer mode and Claude (custom connector) after the last tool or widget change (press Refresh in ChatGPT).
- [ ] Authorization server reachable from Claude's egress range and not behind a WAF that blocks it; discovery, registration and token calls answer within 10 seconds.
- [ ] Content suitable for ages 13+; no commerce, ads or digital goods in results.

## Troubleshooting

| symptom | check |
|---|---|
| ChatGPT shows old tools or widget | press Refresh on the connector; confirm `WIDGET_VERSION` changed after `pnpm widget:build` |
| Claude never offers to sign in | `MCP_AUTH_CHALLENGE` must be `auto` or `http401`; `curl -i` a `tools/call` for `save_prompt` and look for `401` and `WWW-Authenticate` |
| ChatGPT never offers to sign in | needs `result` (or `auto` with an `openai`/`chatgpt` User-Agent) and `_meta["mcp/www_authenticate"]` in the result |
| 401 with a valid-looking token | audience mismatch: connector URL must equal `<base>/mcp` exactly (branch URL on previews); check `BETTER_AUTH_URL` |
| 401 on every token, JWKS errors in logs | the server cannot fetch `<base>/api/auth/jwks` from itself (deployment protection, wrong `BETTER_AUTH_URL`, tunnel down) |
| sign-in loops back to `/` after the magic link | the login wrapper is not used: `loginPage` must be `/oauth/sign-in` in `src/auth/mcp-plugins.ts` |
| write tools missing from `tools/list` | `MCP_OAUTH_ENABLED` is not `true` in that environment |
