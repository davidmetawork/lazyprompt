# LazyPrompt v2 — handoff

Last updated 2026-10-03. Written so a fresh Claude Code session (or person) can continue from the latest step without
this conversation. No secrets are in this file; values live only in Vercel.

## TL;DR

- **LazyPrompt v2 is live at https://www.lazyprompt.ai** (`lazyprompt.ai` redirects to `www`). It replaced the 2025
  buy/sell marketplace on 2026-10-01 via [PR #1](https://github.com/davidmetawork/lazyprompt/pull/1), merged as `b269be0`.
- It is a free community site to find, use, rate and comment on AI prompts, plus a ChatGPT App / Claude connector at
  `/mcp`. 200 original seed prompts across 12 categories are loaded.
- **Sign-in is not usable yet.** Production has no email provider configured, so `/sign-in` shows a "temporarily
  unavailable" notice. Browsing, filling in, copying and the read-only ChatGPT tools all work. The next step is
  Resend + DNS (see "Next actions").
- Production health at handoff: `GET /api/health` -> `{"ok":true,"db":true}`; CI on `main` green.
- **Needs David's decision soon:** the live About, Privacy, Terms and Guidelines pages tell people to email
  `hello@lazyprompt.ai` (a placeholder, marked `TODO-owner-confirm`), but `lazyprompt.ai` has no MX records, so that
  mailbox almost certainly cannot receive mail. Either set up that mailbox or change `SUPPORT_EMAIL` in
  `src/app/(site)/{about,privacy,terms,guidelines}/page.tsx` to an address that works.

## Where things are

| Thing | Location |
|---|---|
| Code | GitHub `davidmetawork/lazyprompt`, branch `main` (local checkout `/Users/davidphillips/LazyPrompt`) |
| Spec (source of truth) | `docs/ARCHITECTURE.md` (24 sections; §20 deploy, §23 build orchestration, §24 advisor changes) |
| ChatGPT App / connector guide | `docs/mcp.md` |
| Dev, tests, parallel worktrees | `README.md` |
| Research notes | `docs/research/{chatgpt-app,stack,product}.md` |
| Seed content | `content/prompts/*.json` (+ `content/categories.json`, `content/tags.json`) |
| Vercel project | team `raydar-xyz`, project `lazyprompt-marketplace` (`prj_Kwdc2EXUvbxdhVKv9TZEmm4wt92i`) |
| Databases | Neon via the Raydar team's Neon installation: `lazyprompt-prod` (Production only), `lazyprompt-db` (Preview + Development) |

The Vercel project keeps the old name `lazyprompt-marketplace` on purpose: it was the project already tied to the repo.

## What was built

Single Next.js 16 app at the repo root (pnpm): React 19, TypeScript strict, Tailwind 4 + shadcn/ui, Postgres + Drizzle,
Better Auth (magic link + optional Google/GitHub + OAuth 2.1 provider for MCP clients), Vitest + Playwright.

- **Site:** home, browse/search (full-text + trigram + typo fallback), categories/tags, prompt page with variable
  fill-in and Copy / Open in ChatGPT, Claude, etc., ratings (Bayesian), 1-level threaded comments, saves, forks, version
  history, profiles, submit/edit, reports.
- **Moderation:** heuristics + trust levels + rate limits, admin queue/reports/users/audit log under `/admin`.
- **ChatGPT App (`/mcp`):** tools `search_prompts`, `get_prompt`, `render_prompt`, `list_categories` (+ `rate_prompt`,
  `save_prompt` only when `MCP_OAUTH_ENABLED=true`), an inline widget, OAuth 2.1 via Better Auth.
- **SEO:** per-prompt metadata + JSON-LD, OG images, sitemap (~260 URLs), RSS (`/feed.xml`), `llms.txt`, robots.

How it was produced (for context only): Opus 5.5 architect + Fable 5.1 advisor wrote and reviewed the spec; a Sonnet 5.5
foundation package, then 7 parallel Sonnet packages in separate git worktrees; an integration fixer; a 6-dimension
Sonnet review with a Fable 5.1 ship gate that produced 3 P0 / 19 P1 / 8 P2 items, all assigned to fix groups and
re-checked by a verifier. Second-pass fixes were not re-verified by a separate verifier, but each group's full gate
(lint, typecheck, unit, integration, build, e2e) passed.

## Verification at handoff

- Merge commit `b269be0` on `main`; CI (lint, typecheck, unit, integration, build, Playwright e2e) green.
- Last full local run (pre-merge): unit 499, integration 288, Playwright 50 passed + 1 skipped by design (the skip is
  the MCP write-tool test that needs `MCP_OAUTH_ENABLED=true`; `tests/e2e/mcp.spec.ts` passes 11/11 with it on).
- Live smoke on www.lazyprompt.ai after the domain switch: all main pages 200, `/api/health` db true, indexable
  (no noindex), canonical + og:image present, MCP `initialize`/`tools/list`/`search_prompts` work.
- Not verified: ChatGPT and Claude connecting to the production `/mcp` end to end (no client was available);
  authenticated flows on production (no sign-in yet).

## Deployment configuration

**Vercel project settings now:** root `.`, Node 24.x, framework Next.js, no install override; `vercel.json` sets
`buildCommand: pnpm vercel-build` (`db:migrate`, then `db:seed` if `SEED_ON_BUILD=true`, then `next build`) and a daily
cron `/api/cron/recompute` at 04:00 (crons run on Production only). Vercel Authentication on previews is **off**
(needed so ChatGPT/Claude can reach a preview `/mcp`).

**Environment variables (names only):**

- *Production:* Neon-injected `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `POSTGRES_*`/`PG*`; `BETTER_AUTH_SECRET`,
  `IP_HASH_SALT`, `CRON_SECRET` (sensitive); `ADMIN_EMAILS=david@quinton.ai`; `NEXT_PUBLIC_SITE_URL=https://www.lazyprompt.ai`;
  `SEED_ON_BUILD=true`; `MCP_OAUTH_ENABLED=false`. No `SEO_NOINDEX`. The production secrets were set by David in his
  own terminal (the agent's auto-mode safety check blocked secret writes), so their values are not known to any agent.
- *Preview:* Neon vars; `BETTER_AUTH_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`; `ADMIN_EMAILS`; `SEO_NOINDEX=true`;
  `SEED_ON_BUILD=true`; `MCP_OAUTH_ENABLED=true`. Preview URL for the (now merged) branch:
  https://lazyprompt-marketplace-git-claude-lazyprompt-v2-raydar-xyz.vercel.app
- Optional and not set anywhere yet: `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID/SECRET`,
  `GITHUB_CLIENT_ID/SECRET`, `OPENAI_API_KEY` (extra moderation only). Full list: `.env.example`, ARCHITECTURE §17.

**Domains:** `lazyprompt.ai` (307 -> `www`) and `www.lazyprompt.ai` are attached to `lazyprompt-marketplace`. DNS is at
GoDaddy (`ns31/ns32.domaincontrol.com`), pointing at Vercel. David says GoDaddy is logged in in his Chrome.

## Rollback (undo the go-live)

Before the switch both domains were on a different Vercel project, `lazyprompt-marketplace-a8ks`
(`prj_bToLYrP1kbxFLBMvl0UEKYL07M2v`), whose last production deployment is the June 2025 marketplace
(`dpl_9dbG9HePDt9maNi36wBiqvYePkfh`, still intact). To restore it, move the domains back (Vercel dashboard
Settings -> Domains, or the API `POST /v1/projects/lazyprompt-marketplace/domains/www.lazyprompt.ai/move` with body
`{"projectId":"prj_bToLYrP1kbxFLBMvl0UEKYL07M2v"}`), then confirm `lazyprompt.ai` followed. Do not delete `-a8ks` until
you are sure you will not roll back.

For the record, `lazyprompt-marketplace` previously had root `apps/marketplace`, build
`npm install && cd packages/database && npx prisma generate && cd ../../apps/marketplace && npm run build`, output
`apps/marketplace/.next`, install `npm install`, Node 22.x, Vercel Authentication on all previews and prod URLs. The
old app's code is in git history before `11a0b87`.

## Next actions (in order)

0. **Fix the support email** shown on the live site (see TL;DR). Quick: edit the four `SUPPORT_EMAIL` constants.
1. **Enable sign-in (blocks everything user-facing):** create a Resend account, verify the sending domain
   `lazyprompt.ai` (SPF/DKIM records go in GoDaddy DNS — DNS is an account setting, so get David's explicit OK for each
   change), then set Production `RESEND_API_KEY` and `EMAIL_FROM` (default sender is `LazyPrompt <login@lazyprompt.ai>`),
   redeploy. Then sign in as `david@quinton.ai` (it becomes admin; promotion requires a verified email, which a magic
   link provides) and check `/admin`.
2. **Turn on ChatGPT/Claude write tools:** set Production `MCP_OAUTH_ENABLED=true`, redeploy, then test in ChatGPT
   developer mode and Claude custom connectors with `https://www.lazyprompt.ai/mcp`. `docs/mcp.md` has the steps. Production
   uses the stable `www` URL, which matters because the OAuth `resource`/audience is bound to the base URL.
3. **Optional social sign-in:** create Google and GitHub OAuth apps with callbacks
   `https://www.lazyprompt.ai/api/auth/callback/{google,github}` and set the four `*_CLIENT_*` vars.
4. **ChatGPT app directory submission** (not started): needs a verified OpenAI organization, privacy/support URLs
   (`/privacy` exists; the support address must be a working one, see item 0), a demo account, and
   `ui.domain`. Tool names and descriptions lock after publication, so settle them first. Details in `docs/mcp.md`.
5. **Confirm policy text** with David before any directory submission: privacy/terms/guidelines pages, and the default
   license (CC BY 4.0 for user prompts, CC0 for seeds).

## Known gaps and follow-ups (none block the live site)

- Deferred from the review: typo-corrected search has no "showing results for ..." label (`listPrompts` would need to
  return a `correctedQuery`); trust-0 profile bios have links stripped instead of being shown only to the owner;
  redacted versions appear as `remove` in the admin log's stored enum (a `redact_version` value needs a migration);
  anonymous MCP usage events still collapse into one actor for ranking.
- Hardening: CSP uses `script-src 'unsafe-inline'` (add a nonce); Neon connection strings trigger a pg `sslmode`
  alias warning in logs (set `sslmode=verify-full`); a harmless `oauth_resource` duplicate-key line can appear in build
  logs when static generation initializes Better Auth in parallel; Vercel Analytics custom events need a paid plan
  (first-party `usage_events` is the source of truth); no WAF/bot protection beyond the app's own rate limits.
- Trending freshness relies on the daily cron plus an opportunistic recompute on page views.
- Nothing has been load-tested.

## Cleanup left undone (needs an owner decision; nothing is deleted)

- Vercel projects `lazyprompt-marketplace-hvgo`, `-4zd2`, `-a8ks`: duplicates of the old app. They are disconnected from
  the repo so they no longer build; keep `-a8ks` until the rollback window passes.
- The preview Neon database `lazyprompt-db` can stay or be removed.
- Local only on David's Mac: build worktrees and branches `claude/lazyprompt-v2-{data-read,data-write,seo,browse-ui,community-ui,admin,mcp,fix-A,fix-B,fix-C}`
  (all merged into `main`) live under a session scratch directory in `/private/tmp`, which may be cleared; if so run
  `git worktree prune`. Also 21 throwaway Postgres databases `lazyprompt_{dev,test,e2e}_<package>` can be dropped.
  The main dev databases are `lazyprompt_dev`, `lazyprompt_test` and `lazyprompt_e2e`.

## Working in the repo

```bash
pnpm install
pnpm db:test:prepare            # creates + migrates the test DBs named in .env.test.local
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration && pnpm build
PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright-lazyprompt pnpm test:e2e
pnpm db:migrate && pnpm db:seed # dev DB (.env.local points at lazyprompt_dev)
```

- Local Postgres 17 (Homebrew service) has `pg_trgm` and `citext`; `pgvector` does not load locally and is unused.
- Node 24 is the target; Node 26 works locally with engine warnings. Playwright's browsers are in the custom path above
  because the default cache had a stale lock.
- e2e rate-limit relaxation (`E2E_DISABLE_RATE_LIMITS`) is set only by `playwright.config.ts` and is ignored whenever
  `VERCEL`/`VERCEL_ENV` is set.
- David's global workflow (`~/.claude/CLAUDE.md`): one `claude/` branch + isolated worktree per task, PR into `main`.
  **`main` deploys to production on Vercel**, so a merge is a release. Merging this docs-only file triggers a harmless
  redeploy of identical code.
- Within this agent's auto permission mode, writing Vercel secrets and merging to `main` were blocked as protected
  actions; David ran the env command himself and approved the merge after leaving auto mode. Expect to ask him for
  secret writes and DNS changes.
- Model-budget rule from David: fan-out agents on Sonnet 5.5 / Haiku 4.5 (Opus 5.x allowed), at most 1-2 Opus planning
  agents, Fable 5.1 as advisor. Keep token use low.
