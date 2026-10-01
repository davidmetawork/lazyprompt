# LazyPrompt

A free community library of AI prompts. Browse, search, fill in the variables and copy (or open prefilled in ChatGPT, Claude, Grok or Perplexity) without an account. Sign in to submit, rate, comment, save and fork. LazyPrompt never runs an LLM itself.

- **Spec:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the source of truth (research in `docs/research/`).
- **Stack:** Next.js 16.3 (App Router, Turbopack, `proxy.ts`, cacheComponents off), React 19.2, TypeScript strict, Tailwind 4 + shadcn/ui (**Radix base**, style `radix-nova`, see `components.json`), Drizzle ORM + Postgres 17, Better Auth 1.7 (magic link, Google, GitHub, admin, MCP OAuth plugins), Vitest 5, Playwright, pnpm 10.

## Local development

1. Node 24 (`.nvmrc`; Node 26 works locally, Vitest 5 declares `^22.12 || ^24`) and pnpm 10.33.1 (`packageManager`).
2. Postgres 17 on `localhost:5432` with no password for your OS user. Create the databases:
   ```bash
   createdb lazyprompt && createdb lazyprompt_test
   ```
   (`pg_trgm` and `citext` are enabled by migration `0000_extensions`.)
3. Environment:
   ```bash
   cp .env.example .env.local
   openssl rand -base64 32   # paste into BETTER_AUTH_SECRET, and again into IP_HASH_SALT
   ```
   `pnpm build` locally needs a **migrated** `DATABASE_URL` plus `BETTER_AUTH_SECRET` and `IP_HASH_SALT` (or the CI env block from `.github/workflows/ci.yml`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, `SEO_NOINDEX=true`).
4. `pnpm install && pnpm db:migrate && pnpm db:seed --fixtures && pnpm dev` (use `pnpm db:seed` for the real library once `content/prompts/*.json` exists).
5. Sign in at `/sign-in`: the magic link is printed to the terminal and appended to `MAGIC_LINK_DEV_SINK` (JSON lines `{email,url,ts}`). Put your email in `ADMIN_EMAILS` to become an admin (applied on user create and on every sign-in).
6. MCP (later packages): `npx @modelcontextprotocol/inspector@latest` against `http://localhost:3000/mcp`; for ChatGPT dev mode use a tunnel and set `BETTER_AUTH_URL` to it.

### Scripts

| script | what it does |
|---|---|
| `dev`, `build`, `start` | Next.js. `vercel-build` = `db:migrate`, optional `db:seed` (`SEED_ON_BUILD=true`), `next build` |
| `lint` | `eslint .` |
| `typecheck` | `next typegen && tsc --noEmit` |
| `test`, `test:unit`, `test:integration`, `test:e2e` | Vitest projects `unit` + `unit-dom`, Vitest project `integration`, Playwright |
| `db:generate` | `drizzle-kit generate` (only the foundation touches migrations) |
| `db:migrate` | apply `drizzle/*.sql` to `DATABASE_URL_UNPOOLED ?? DATABASE_URL` |
| `db:test:prepare` | create (if missing) + enable extensions + migrate the databases named by `TEST_DATABASE_URL` and `TEST_DATABASE_URL_E2E` |
| `db:seed`, `seed:check`, `db:seed:demo`, `db:reset` | idempotent seed (`--fixtures` for tests), validate-only (no DB), local fake users/ratings, drop and re-migrate a local DB |
| `widget:build` | build `widget/` into one HTML file and embed it in `src/mcp/widget-html.generated.ts` (deterministic; CI fails on a diff) |
| `auth:generate` | `npx auth@latest generate ...` into `.data/auth-generated.ts` (gitignored; for diffing against `src/db/schema/auth*.ts` only. It must stay outside `src/db/schema/`, because drizzle-kit loads every file in that directory) |

## Parallel worktrees

Several worktrees can run tests, dev servers and Playwright at the same time as long as each one has its own databases and ports. Every test resource is env-overridable:

| variable | default | used by |
|---|---|---|
| `TEST_DATABASE_URL` | `postgres://localhost:5432/lazyprompt_test` | `pnpm test:integration` (also exported to the unit projects as `DATABASE_URL`) |
| `TEST_DATABASE_URL_E2E` | `postgres://localhost:5432/lazyprompt_e2e` | `pnpm test:e2e` web server and global setup |
| `E2E_PORT` | `3100` | Playwright `webServer` (`next start -p $E2E_PORT`) and `baseURL` |
| `E2E_MAGIC_LINK_SINK` | `.data/e2e-magic-links-$E2E_PORT.jsonl` | magic-link sink the e2e `signIn` helper reads |
| `PORT` / `BETTER_AUTH_URL` | `3000` / derived | dev server origin (`PORT=3201 pnpm dev -p 3201`) |

Per-worktree overrides go in two gitignored files (never committed):

- `.env.test.local` for tests and Playwright (loaded before `.env.local`),
- `.env.local` for `pnpm dev`, `db:migrate`, `db:seed`.

Real environment variables always win over both files. Example for a worktree called `data-read`:

```bash
cat > .env.test.local <<'EOT'
TEST_DATABASE_URL=postgres://localhost:5432/lazyprompt_test_data_read
TEST_DATABASE_URL_E2E=postgres://localhost:5432/lazyprompt_e2e_data_read
E2E_PORT=3111
EOT
pnpm install
pnpm db:test:prepare     # creates + migrates both databases (safe to repeat)
pnpm test:unit && pnpm test:integration
pnpm test:e2e            # builds, starts on :3111, seeds fixtures, runs tests/e2e/*.spec.ts
```

The same thing inline: `TEST_DATABASE_URL=postgres://localhost:5432/lazyprompt_test_x E2E_PORT=3112 pnpm test:integration`. `resetDb()` refuses to truncate a database whose name does not contain `test` or `e2e`.

Playwright browsers: `pnpm exec playwright install chromium`. If a stale lock in `~/Library/Caches/ms-playwright` blocks the download, set `PLAYWRIGHT_BROWSERS_PATH` to another directory for both the install and the test run.

## Layout and conventions

```
src/proxy.ts                optimistic session-cookie redirects (Next 16: proxy, not middleware)
src/app/                    routes ((site) group = header + footer; /api/auth, /api/health)
src/auth/                   server.ts (Better Auth config), client.ts, viewer.ts (getViewer / require*), email.ts, mcp-plugins.ts
src/db/                     index.ts (pg Pool + drizzle), profiles.ts (ensureProfile), schema/{auth,auth-oauth,app}.ts
src/lib/                    constants, types, validation (zod 4), errors, slug, models, env (lazy), base-url, template/ (parser+renderer)
src/server/                 the ONLY data layer: reads take plain args, writes take `actor: Viewer` first
src/components/{ui,layout,auth,community,prompt,seo}
content/                    categories.json, tags.json (canonical tag vocabulary), prompts/<category>.json (seed library)
scripts/                    migrate, seed (+schema, demo), db-test-prepare, db-reset, embed-widget
tests/{helpers,fixtures,unit,integration,e2e}
```

### Rules

- **Import-graph rule.** Nothing in `src/db/**`, `src/auth/{server,email,mcp-plugins}.ts`, `scripts/**` or `src/lib/**` may import `server-only` (directly or transitively) or anything from `src/server/**`. `server-only` throws under `tsx`, `drizzle-kit` and the Better Auth CLI. `ensureProfile` therefore lives in `src/db/profiles.ts` and `src/server/users.ts` re-exports it. `src/lib/env.ts` is lazy and never throws at import. Check: `grep -rln "server-only" src/db src/lib scripts src/auth/server.ts src/auth/email.ts src/auth/mcp-plugins.ts` must print nothing.
- **Test file names.** DOM tests are `*.dom.test.tsx` (project `unit-dom`, jsdom); everything else is `*.test.ts`. Vitest cannot render async server components, so DOM tests cover sync client components only. No per-file environment docblocks.
- **Actions vs pages.** Server actions use `toActionResult` + `requireViewerForAction()` / `requireAdminForAction()` (throw `AppError`, never navigate). Pages use `requireViewer()` / `requireAdmin()` (redirect / `notFound()`). `await requireAdmin()` is the first statement of every admin page.
- **Caching.** Every page is dynamic SSR. `React.cache()` keys by argument identity, so cached functions take primitive arguments only.
- **Parallel packages must not change** the schema or migrations, `package.json` dependencies, `src/lib/**` (except the SEO package's `src/lib/seo/**` and `src/lib/analytics.ts`), `vitest.config.ts`, `playwright.config.ts` or `next.config.ts`. Needed changes go in the package's final report for the captain. The single exception is the MCP OAuth schema (ARCHITECTURE.md section 3).

### Package ownership map (ARCHITECTURE.md section 22)

| package | owns |
|---|---|
| foundation | everything shared (this scaffold), `src/db/**`, `src/lib/**`, auth, `src/components/{ui,layout,auth}`, tests harness, CI, seed tooling |
| data-read | `src/server/prompts/{mappers,queries}.ts`, `taxonomy.ts`, `search/**`, `ranking/**`, `usage.ts`, `/api/events`, `/api/cron` |
| data-write | `src/server/prompts/mutations.ts`, `ratings.ts`, `comments.ts`, `saves.ts`, `reports.ts`, `users.ts`, `moderation/**`, `rate-limit.ts` (already real) |
| browse-ui | home, `/prompts`, `/c/*`, `/t/*`, `/p/[slug]`, `src/components/prompt/**` |
| community-ui | submit/edit, versions, profiles, `/me/*`, settings, `src/components/community/**`, `src/actions/**` |
| admin | `/admin/**`, `src/components/admin/**`, `src/actions/admin.ts` |
| mcp | `/mcp`, `/api/well-known/**`, `/oauth/consent`, `/apps`, `src/mcp/**`, `src/auth/mcp-plugins.ts`, `widget/**` |
| seo | `src/lib/seo/**`, `src/components/seo/**`, `src/lib/analytics.ts`, static policy pages, sitemap/robots/feed/OG |

What the foundation implemented for real (both data packages depend on it): `rate-limit.ts`, `findSimilarPrompts`, `prompts/mappers.ts`, `ensureProfile`, `ranking/score.ts`, `listCategories`/`getCategoryBySlug`, `getPromptByShortId`/`getPromptById`, `listPrompts` (ILIKE search for now), `getHomeSections` (trending = top), `getViewerPromptState`. Everything else under `src/server/**` is a typed stub that `throw`s `notImplemented("fnName")`.

## Auth and OAuth notes

- Better Auth plugins: `admin`, `magicLink`, then `jwt()`, `mcp()`, `cimd()` (from `mcpAuthPlugins()`), then `nextCookies()` last. The OAuth tables (`oauth_client`, `oauth_resource`, `oauth_client_resource`, `oauth_access_token`, `oauth_refresh_token`, `oauth_consent`, `oauth_client_assertion`) are real and live in `src/db/schema/auth-oauth.ts` and migration `0001_init`; there is no empty fallback. The plugin seeds an `oauth_resource` row for `<base>/mcp` when it initializes, so the first cold start (or build worker) after a fresh migrate may log one harmless unique-violation from concurrent seeding.
- `src/auth/client.ts` includes `oauthProviderClient()`, which only activates when the sign-in page URL carries a signed OAuth query (`sig`), and then forwards it with sign-in requests. `/sign-in` never rewrites or strips such URLs.
- `pnpm auth:generate` runs the Better Auth CLI against `src/auth/server.ts` (needs a migrated `DATABASE_URL`: the OAuth plugin queries the database while initializing).

## Seed content

`content/categories.json` (12 categories) and `content/tags.json` (the canonical tag vocabulary, about 76 tags) are foundation-owned. Seed prompts live in `content/prompts/<category-slug>.json` (format: `content/prompts/README.md`). `pnpm seed:check` validates everything without a database and only **warns** about tags outside `tags.json`. `pnpm db:seed --fixtures` loads `tests/fixtures/prompts.json` (12 prompts, one per category) and is idempotent: the second run reports 0 inserted, 0 updated.
