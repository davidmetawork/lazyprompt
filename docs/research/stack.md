# LazyPrompt stack research (2026-10-01)

Versions (npm view today): next 16.3.8, better-auth 1.7.7, @better-auth/{mcp,cimd,oauth-provider,drizzle-adapter} 1.7.7, drizzle-orm 0.45.3, **drizzle-kit 0.31.11** (latest, not 1.x), tailwindcss 4.3.3, vitest 5.0.3 (needs Node ^22.12 || ^24), playwright 1.63.0, shadcn 4.21.1, pg 8.23.1, @vercel/functions 3.9.9, @modelcontextprotocol/server 2.2.0 (MCP SDK v2; old `@modelcontextprotocol/sdk` is 1.31.0), resend 6.31.0. better-auth peers accept these.

## 1. Next 16.3
- Turbopack default; `next lint` removed; React 19.2; Node >=20.9. Server actions: `useActionState(action, init)` with `(prev, formData)`; `updateTag` then `redirect()` outside try/catch.
- `middleware.ts` is deprecated -> `proxy.ts`, export `proxy(request)`; runtime is Node.js only, `runtime` config throws. Codemod: `npx @next/codemod@canary middleware-to-proxy .`. Keep `middleware.ts` only if you need edge. https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Sync access to `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` is fully removed. Always `const { slug } = await params`. `npx next typegen` gives global `PageProps<'/x/[slug]'>` / `LayoutProps` types. `opengraph-image`/`sitemap` get async params/id too.
- Cache Components: `cacheComponents: true` in next.config.ts (replaces experimental.dynamicIO/useCache/ppr). Everything is dynamic by default; opt in with `'use cache'` + `cacheLife(...)` + `cacheTag(...)` from `next/cache`. Route segment configs `dynamic`, `revalidate`, `fetchCache` ERROR once enabled.
  - Cached scopes cannot call `cookies()`/`headers()`/read `searchParams` (also transitively through helpers). Read outside, pass values as (serializable) args. Failure can pass `next build` and only fail at runtime on dynamic routes.
  - Runtime data must sit under `<Suspense>` or build errors ("uncached data accessed outside Suspense"). Awaiting request promises inside `use cache` causes a prerender timeout.
  - Always set explicit `cacheLife` (default profile = stale 5m / revalidate 15m / expire never). Custom profiles in `cacheLife: {...}` in config.
- Invalidation: `revalidateTag(tag, 'max')` — **2nd arg now required** (single-arg is deprecated, behaves like `{expire:0}`). `updateTag(tag)` = immediate expire, read-your-writes, **Server Actions only**. From route handlers/webhooks: `revalidateTag(tag, {expire: 0})`. Tags <=256 chars, case-sensitive.

## 2. better-auth 1.7.7
Packages: `better-auth`, `@better-auth/drizzle-adapter` (adapter moved out of core: `import { drizzleAdapter } from "@better-auth/drizzle-adapter"`), `@better-auth/mcp`, `@better-auth/cimd`, `@modelcontextprotocol/server`, `zod`. 
- Route: `app/api/auth/[...all]/route.ts`: `export const { GET, POST } = toNextJsHandler(auth)` from `better-auth/next-js`.
- `plugins: [..., nextCookies()]` — must be LAST (sets cookies from server actions).
- Session: `await auth.api.getSession({ headers: await headers() })` in RSC, actions, route handlers. `auth.api.*` calls bypass rate limiting.
- proxy.ts: 1.7 docs show a full `auth.api.getSession` in `proxy()` (Node runtime OK) with `config.matcher`. Cheaper optimistic check: `getSessionCookie(request)` from `better-auth/cookies` (existence only, NOT secure). Always re-check in the page/action/DAL.
- Drizzle adapter: `database: drizzleAdapter(db, { provider: "pg", schema })`. Optional `advanced.database.joins: true` (fewer queries in get-session). `schemaName` option for pg schemas.
- **CLI is the `auth` package now** (`@better-auth/cli` stalled at 1.4.21): `npx auth@latest generate --config src/lib/auth.ts --output src/db/auth-schema.ts` (check flags with `--help`). `auth migrate` only works with the built-in Kysely adapter, so with Drizzle: generate, then `drizzle-kit generate` + `migrate`. Re-run generate whenever a plugin is added (admin, jwt, mcp add tables/columns). `npx auth@latest create-admin --email x --name X --role admin` bootstraps the first admin.
- Social: `socialProviders: { google: {clientId, clientSecret}, github: {...} }`. Redirect URIs `{BASE}/api/auth/callback/google|github`; need separate OAuth apps for localhost vs prod (GitHub allows only one callback per app). Set `baseURL`/`BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`; on Vercel previews the URL changes (use `trustedOrigins` / dynamic baseURL; uncertain exact preview recipe).
- Magic link: `magicLink({ expiresIn: 300, sendMagicLink: async ({ email, url, token, metadata }, ctx) => {...} })` from `better-auth/plugins`. Client `authClient.signIn.magicLink({email, callbackURL, newUserCallbackURL, errorCallbackURL})`. Token consumed atomically on first hit (`allowedAttempts` is ignored) — email link scanners can burn the token; verify via GET `/magic-link/verify`.
- Admin: `admin({ defaultRole: "user", adminRoles: ["admin"], adminUserIds: [...] })` from `better-auth/plugins`; client `adminClient()`. Adds `user.role, banned, banReason, banExpires` and `session.impersonatedBy`. Multiple roles stored comma-separated. Custom roles need `createAccessControl` and `ac`+`roles` options. Server: `auth.api.setRole({body:{userId, role}, headers})`, `listUsers`, `banUser`.
- Rate limit: on by default only in production (100 req/60s, stricter built-in rules e.g. `/sign-in/email` 3/10s). Dev off unless `rateLimit.enabled: true`. Default storage is memory — useless on serverless; set `rateLimit.storage: "database"` (table `rateLimit`, generated by CLI) or `secondaryStorage`. Per-path: `customRules: {"/sign-in/magic-link": {window: 60, max: 3}}`. On Vercel set `advanced.ipAddress.ipAddressHeaders: ["x-real-ip"]`.

### MCP OAuth server (key finding)
In 1.7 the old `mcp` (from `better-auth/plugins`, built on oidc-provider, `withMcpAuth`, `oAuthDiscoveryMetadata`) is deprecated/superseded. Current: **`mcp()` from `@better-auth/mcp`**, built on OAuth 2.1 Provider (`@better-auth/oauth-provider`). `mcp()` IS the provider — do not also add `oauthProvider()`. **`jwt()` plugin is required** (signing key + `/jwks`).
```ts
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
plugins: [ jwt(),
  mcp({ loginPage: "/sign-in", consentPage: "/consent",
        resource: "https://lazyprompt.ai/api/mcp",   // HTTPS (http only on loopback); becomes token `aud`
        scopes: ["openid","profile","email","offline_access","mcp:read"] }),
  cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),  // client identity via metadata URL
  nextCookies() ]
```
- Endpoints under auth base path (`/api/auth`): `/oauth2/authorize`, `/oauth2/token`, `/oauth2/userinfo`, `/oauth2/register` (only if DCR enabled), `/jwks`. Tables: `oauthClient, oauthAccessToken, oauthRefreshToken, oauthConsent, oauthClientAssertion` (+ `jwks`). Run `auth generate` after adding.
- DCR is OFF unless `allowDynamicClientRegistration: true, allowUnauthenticatedClientRegistration: true`. Older MCP clients (2025-spec: Claude Desktop/Cursor, etc.) may still need DCR — decide whether to enable (see Uncertain).
- Discovery: RFC 9728 `/.well-known/oauth-protected-resource` is served automatically (root + resource-path alias); AS metadata at issuer-inserted well-known. Because the issuer has base path `/api/auth`, the well-known docs live at `/.well-known/oauth-authorization-server/api/auth`; ensure Next routes/rewrites forward `/.well-known/*` to `auth.handler` (docs: "if your framework only forwards the catch-all route, make sure issuer metadata URLs reach auth.handler").
- Resource server (verifies bearer locally against JWKS: signature, iss, aud, exp, DPoP; no DB hit; 401 with RFC 9728 `WWW-Authenticate`; 403 `insufficient_scope`):
```ts
// app/api/mcp/route.ts  (POST only; GET/DELETE -> 405)
import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
const h = createMcpHandler(() => { const s = new McpServer({name:"lazyprompt",version:"1.0.0"}); /* s.registerTool(...) */ return s; }, { legacy: "reject" });
export const POST = requireMcpAuth(auth, (req, claims) => h.fetch(req /*, { authInfo }*/), { resource, requiredScopes: ["mcp:read"] });
```
- `legacy: "reject"` accepts only MCP spec 2026-07-28 (stateless POST). Clients on the 2025 session-based transports will be rejected; drop `reject` or use SDK legacy mode if you need them (uncertain what flag values exist).

## 3. Drizzle + Postgres driver
- Recommendation: **node-postgres (`pg`) + `drizzle-orm/node-postgres`** for both local Postgres 17 and Neon. Neon's own Vercel guidance: with Fluid compute use `pg` + a Pool + `attachDatabasePool` from `@vercel/functions` (TCP is lowest latency once warm; pool is safe because Fluid closes idle conns before suspend). https://neon.com/docs/guides/vercel-connection-methods
```ts
import { Pool } from "pg"; import { drizzle } from "drizzle-orm/node-postgres"; import { attachDatabasePool } from "@vercel/functions";
const g = globalThis as any;
const pool: Pool = (g.__pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));
if (process.env.VERCEL) attachDatabasePool(pool);
export const db = drizzle({ client: pool, schema });
```
  Use pooled `DATABASE_URL` (pgbouncer, transaction mode) at runtime; `DATABASE_URL_UNPOOLED` for drizzle-kit migrate (advisory locks) and LISTEN/NOTIFY. Real transactions work (unlike neon-http).
- Rejected: `neon-http` (no interactive transactions, per-query HTTP; better-auth/drizzle do transactions); `@neondatabase/serverless` WebSocket Pool (works, only needed for edge, extra WS ws shim locally); `postgres-js` (fine locally; behind pgbouncer transaction mode set `prepare: false`; no `attachDatabasePool` support listed — Vercel list names pg, mysql2, mongodb, ioredis, cassandra).
- drizzle-kit config: `defineConfig({ dialect:"postgresql", schema:"./src/db/schema", out:"./drizzle", dbCredentials:{ url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! } })`. Flow: `drizzle-kit generate` (commit SQL) then `drizzle-kit migrate` (or `migrate()` from `drizzle-orm/node-postgres/migrator`) in CI/build step, never `push` on prod.
- Generated tsvector + GIN (documented pattern):
```ts
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
export const prompts = pgTable("prompts", { id: uuid().primaryKey().defaultRandom(), title: text().notNull(), body: text().notNull(),
  search: tsvector("search").generatedAlwaysAs((): SQL => sql`setweight(to_tsvector('english', ${prompts.title}),'A') || setweight(to_tsvector('english', ${prompts.body}),'B')`)
}, (t) => [ index("prompts_search_idx").using("gin", t.search) ]);
```
- pg_trgm index: `index("t").using("gin", sql`${t.title} gin_trgm_ops`)` (or `t.title.op("gin_trgm_ops")`; uncertain which drizzle-kit 0.31 emits correctly — verify the generated SQL, else hand-edit the migration).
- Extensions (`CREATE EXTENSION IF NOT EXISTS pg_trgm; ... citext;`) are not generated by drizzle-kit: add via `drizzle-kit generate --custom --name=extensions` as the first migration. Neon supports pg_trgm and citext.

## 4. Tailwind 4.3 + shadcn
- Tailwind v4: CSS-first, no tailwind.config; `@import "tailwindcss";` in globals.css, `@tailwindcss/postcss` plugin (`postcss.config.mjs`: `{ plugins: { "@tailwindcss/postcss": {} } }`). shadcn uses `@theme inline`, `tw-animate-css`.
- Init: `pnpm dlx shadcn@latest init` (new project or existing; flags `-t next`, `-d` defaults = next + preset base-nova, `-p` preset, `-y`). `add button`, `info`, `search`, `docs` subcommands exist. Writes `components.json`, `lib/utils.ts` (`cn`). Base library may be Base UI vs Radix depending on preset (uncertain; check `components.json`).

## 5. Testing
- Next docs: Vitest does not support **async Server Components**; unit-test only sync components + pure/server modules, E2E (Playwright) for async RSC/pages. https://nextjs.org/docs/app/guides/testing/vitest
- Vitest 5 requires Node 22.12+/24. Config: `vitest.config.ts` with `vite-tsconfig-paths`, `@vitejs/plugin-react`; split with `test.projects` (inline projects reuse the parent Vite server in v5; arrays like `setupFiles` merge, `extends:false` to opt out).
- Real-DB pattern (recommended): docker/Homebrew PG17 database `lazyprompt_test`; `globalSetup` creates DB if absent, runs `migrate(db, {migrationsFolder})`; `setupFiles` aliases/mocks `server-only` (`vi.mock("server-only", () => ({}))`), `next/cache` (`vi.mock` `cacheTag/cacheLife/updateTag/revalidateTag` no-ops) and `next/headers`. Isolation: `TRUNCATE ... RESTART IDENTITY CASCADE` in `beforeEach`, or per-worker schema. Playwright: `webServer` runs `pnpm build && pnpm start` against the test DB; log magic-link URL via the dev fallback for e2e sign-in.

## 6. Neon on Vercel
- Vercel Marketplace has two paths: **Vercel-Managed** (billing via Vercel; org "Vercel: <team>") and **Neon-Managed** (existing Neon account); cannot coexist in one project. Both inject `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), and legacy `PGHOST/PGUSER/PGDATABASE/PGPASSWORD/PGPORT` (older integration also `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`; uncertain which still ship — read the Vercel project env after install and pin names). https://neon.com/docs/guides/vercel-managed-integration , /neon-managed-vercel-integration
- Preview branching: toggle "Automated Preview Branching" — each Preview deployment gets a copy-on-write branch (`preview/<git-branch>` in Neon-managed) with its own `DATABASE_URL*`. Vercel-managed cleans up on deployment retention; Neon-managed on git branch delete. Migrations must run per preview (build step: `pnpm db:migrate && next build`, using `DATABASE_URL_UNPOOLED`).

## 7. Vercel runtime
- Node: default for new projects is **24.x** (also 22.x, 20.x). Pin with `"engines": {"node": "24.x"}` in package.json (overrides project setting). Match local (`.nvmrc` 24).
- Fluid compute is default for projects created after 2025-04-23 (toggle: Settings > Functions; or `vercel.json` `"fluid": true`). Default and max duration 300s on Hobby; set per-function `export const maxDuration = 60` in route files or `vercel.json` `functions`. Do not export `dynamic`/`revalidate` route configs under cacheComponents.
- pnpm: Vercel infers from `pnpm-lock.yaml`; lockfileVersion 9.0 -> pnpm 9 or 10 (check build log). Pin explicitly: `"packageManager": "pnpm@10.x.y"` in package.json (Corepack) — note Vercel Corepack support is experimental (`ENABLE_EXPERIMENTAL_COREPACK=1` env var; uncertain whether still needed). A bare `installCommand: "pnpm install"` override picks the OLDEST pnpm (6) — avoid. pnpm 10 blocks dependency build scripts: whitelist via `pnpm.onlyBuiltDependencies` (e.g. `esbuild`, `sharp`, `@tailwindcss/oxide`) in package.json.

## Uncertain (verify before committing)
1. Whether Claude.ai / ChatGPT / Cursor MCP clients today use CIMD or still require DCR; enable `allowDynamicClientRegistration` only if needed, with rate limits.
2. `legacy: "reject"` blocks 2025-spec clients; exact SDK v2 option values for dual support.
3. Exact `.well-known` route wiring for an issuer under `/api/auth` in Next (rewrites vs route files); test with `curl` and MCP Inspector.
4. Which Neon env vars (`POSTGRES_URL*`) the Vercel-managed integration injects today.

5. `'use cache'` behavior under Vitest; drizzle-kit 0.31 emit for `gin_trgm_ops` and quoting of generated `tsvector` type (historical bug: hand-fix SQL).
