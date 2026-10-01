# LazyPrompt product research (2026-10-01)

Method: live browser tests (logged-out) of deep links, plus search of official docs. Competitor observations from memory are marked (mem). Verify before relying on them.

## 1. Landscape: what wins, what rots
- **PromptBase** (paid marketplace, 20% fee, approval 15 min to 36 h; https://promptbase.com/support). Models filter now includes Claude/Gemini/Grok; also sells "Agent Skills". Lesson: paid model means gated, curated, but mostly image prompts; text prompts are thin. Hand-picked "featured" is its quality signal.
- **AIPRM** (browser extension, 5,500+ public prompts). Shows views / uses / votes per prompt; top prompts have 17M views but only ~340 votes (https://app.aiprm.com/prompts). Lesson: usage is huge, voting is ~0.003% of uses, so ratings need a low-friction post-copy "did it work?" prompt. The list is dominated by "100% unique SEO article" spam clones (mem: filled with keyword-stuffed, near-duplicate titles).
- **prompts.chat / awesome-chatgpt-prompts**: open-source, CC0, "Act as a ..." persona list; community, collections. Lesson: free + simple + GitHub-sourced wins on trust; persona prompts are stale as models improve.
- **FlowGPT/PromptHero/Snack Prompt (mem):** open submission + raw popularity ranking led to jailbreak/NSFW/clone sludge. Anthropic/OpenAI libraries: curated but small, rarely updated.
- **Why libraries go stale/spammy:** no model-version metadata; no "last verified" date; copy-count ranking rewards old items; no dedupe; no outcome evidence; no way to flag "broken".
- **What users value:** copy in one click; works on first try; example output; variables to fill; no login to copy; model-specific tips; trust that it's been tested recently.

## 2. v1 feature set (MoSCoW)
**Must**
- Browse/search (title, body, tags; Postgres FTS or Typesense/Orama), category/tag/model filters, sort: Top / Trending / New.
- Prompt page: body, variable fill-in form, live preview, Copy, "Open in" model buttons, example output, target models, "last tested on" model+date.
- 1-5 star rating (one per user, editable), comments (flat + 1 reply level), save/favorite, copy counter.
- Submit prompt (account required to post, not to use); report button; markdown-safe rendering.
- Slug pages with SEO structured data, sitemap.
- Moderation queue (new users) + admin tools.
- ChatGPT App (MCP): search_prompts, get_prompt, render_prompt (fill variables).
**Should**
- Collections/lists; fork/"remix" with attribution; version history; "worked / didn't work" 1-click feedback after copy; email-less login (GitHub/Google); RSS/JSON export; OG images; duplicate detection on submit.
**Could**: chains, per-model variants, badges, extension, API, i18n.
**Won't (v1)**
- Payments/paid prompts; image-prompt gallery; running prompts on our own LLM key (cost/abuse); DMs; follow feeds.

## 3. Taxonomy
- **Category (single, ~12, stable):** Writing, Marketing & SEO, Coding, Data & Analysis, Business & Strategy, Research & Learning, Productivity, Career, Customer Support, Creative & Fiction, Personal & Life, Image & Video Gen. Single primary category = clean URLs (`/c/coding`).
- **Use-case/intent (facet, enum):** generate, rewrite/edit, summarize, extract, analyze, brainstorm, plan, critique/review, translate, roleplay/tutor, system-prompt/agent.
- **Target models (multi-select + "any"):** ChatGPT, Claude, Gemini, Perplexity, Grok, Copilot, Mistral, Llama/open, plus optional `tested_on[{model, version, date}]`.
- **Tags:** free-form, max 5, normalized lowercase-hyphen, autocomplete from existing, admin merge/alias. Promote tag to category-like landing page only past N prompts (SEO thin-content guard).

## 4. Template variable syntax and fill-in UX
- **Syntax (recommended):** `{{name}}`, `{{name|default value}}`, with descriptions/types in a separate structured `variables` array rather than inline, so the body stays clean and portable:
  ```json
  [{"key":"tone","label":"Tone","type":"select","options":["formal","friendly"],"default":"friendly","required":false,"help":"Voice of the email"}]
  ```
  Inline shorthand parsed at submit: `{{key|default}}`; `{{key:select(a,b,c)}}`, `{{key:long}}` optional. Regex: `\{\{\s*([a-zA-Z_][\w-]*)\s*(?::([^|}]+))?(?:\|([^}]*))?\}\}`. Double-braces chosen because single `{}` collides with JSON/code in prompts; allow `\{{` escape. Same variable repeated = one field.
- **UX:** form above/beside body; fields auto-generated; live preview with filled values highlighted and unfilled shown as `[Label]` chips; "Copy" is enabled always (unfilled left as `[label]`); persist last values in localStorage per prompt; "Open in <model>" uses the filled text; warn if encoded URL > ~2000 chars and fall back to copy+open blank chat (see section 8). Never send user-filled values to our server.
- ChatGPT App render_prompt takes `{variables}` map and returns filled text; return missing-required list.

## 5. Ranking
- **Top (quality) = Bayesian average:** `score = (C*m + sum(stars)) / (C + n)`, with m = global mean (~4.0, recompute nightly), C = 5 to 10 (tune so one 5-star doesn't beat 4.7 x 30). Show raw average + count to users; sort by Bayesian. Evan Miller's credible-interval lower bound (https://www.evanmiller.org/ranking-items-with-star-ratings.html) is the stricter alternative. Wilson lower bound is for binary up/down; for stars it requires thresholding (4+ = positive) and discards info. Use Wilson only for the "worked / didn't work" binary signal. Weight votes by account age/trust (new accounts weight 0.3 until confirmed).
- **Trending (time-decayed):** `t = (w_copy*copies + w_open*opens + w_save*saves + w_star*(stars-3 positive only) + w_cmt*comments) / (age_hours + 2)^1.5`, using unique-user events in the last 7 days (HN-style gravity 1.5; https://news.ycombinator.com mem). Suggested weights: copy 1, open-in 2, save 3, rating>=4 3, comment 2. Cap per-user contribution per prompt per day to 1; dedupe by user/IP hash; require >=3 unique users. Alternative: exponential decay with half-life 3 days on event counts. Recompute every 10 min into a cached column.
- **New:** chronological, only approved, with newness boost slot.

## 6. Quality signals
- Displayed: avg + count, copy count, "worked for N%" (Wilson), "tested on Claude Opus x, 2026-09" badge, last updated, author trust badge, editor's pick.
- Gated: min length (>=40 chars), must contain at least one example output or "why it works", must declare target model(s), duplicate similarity check (embedding or trigram >0.85 => reject/merge).
- Staleness: auto-flag prompts untouched >12 months with falling "worked" rate; "Needs retest" label; hide from Trending.
- Reports with reason ("broken", "spam", "jailbreak", "copyright").

## 7. Small-team anti-spam / moderation
- Free to read and copy without login; login (GitHub/Google OAuth) to post/rate/comment. Turnstile (Cloudflare) on signup/submit; rate limits (3 submits/day new, 20 comments/day).
- Trust levels (Discourse-style): L0 new = posts held in queue and rating weight low; L1 after 3 approved posts / 7 days = auto-publish; L2 = can flag with weight. Shadow-hold links in first posts; ban URL shorteners and affiliate patterns.
- Automated first pass: OpenAI Moderation API (free) or Llama Guard for NSFW/hate; regex/LLM check for jailbreak ("DAN", "ignore previous instructions") and SEO-clone titles ("100% unique", "plagiarism free"); trigram dedupe. LLM triage returns approve/reject/human with reason; humans only review the "human" bucket.
- Policy: no jailbreaks/NSFW/personal data/malware; CC0 or CC-BY at submit; DMCA/takedown contact; 3-strike bans; public changelog of removals. Weekly 30-min admin review; 2+ reports auto-hide pending review.

## 8. Deep links to prefill a prompt (tested live 2026-10-01, logged out, Chrome-based pane)
Encode value with `encodeURIComponent` (spaces `%20`, newlines `%0A`); `+` also commonly accepted but `%20` is safest. Treat all as "may break any time"; always provide Copy fallback.

| Model | URL | Result today |
|---|---|---|
| ChatGPT | `https://chatgpt.com/?q={enc}` (optional `&hints=search` ; `&temporary-chat=true`) | VERIFIED: input prefilled, not sent; URL rewritten to `/?model=auto`. `hints` values from third parties (search, image, think, research, shopping, study, canvas): not verified. |
| Claude | `https://claude.ai/new?q={enc}` | PARTIAL: logged out redirects to login with `returnTo=/new?q=...` (q preserved). Third-party sources (Zenn 2026-08-14, folge.me) report it works; Stack Overflow says works; an Oct-2025 issue claimed removal (claude-code #19023). Official Help Center documents `claude://claude.ai/new?q=` (desktop app, truncated ~14,000 chars) and `https://claude.ai/code/new?q=...&repo=` / `claude://code/new` (https://support.claude.com/en/articles/14729294, /14898120). Uncertain: https q on logged-in web. |
| Perplexity | `https://www.perplexity.ai/search?q={enc}` | VERIFIED: redirects to `/search/new?q=` and AUTO-SUBMITS, answers immediately. Not a prefill; warn user. |
| Grok | `https://grok.com/?q={enc}` | VERIFIED: prefills and shows a "Send this message? The link you opened pre-filled this message" confirmation dialog, nothing sent until user confirms. |
| Gemini | `https://gemini.google.com/app?q=` | NOT SUPPORTED: input stays empty (matches Zenn article; Chrome extensions exist to fill the gap). Use Copy + open `https://gemini.google.com/app`. Optionally Google AI Mode: `https://www.google.com/search?udm=50&q={enc}` (per Zenn; not tested; one-shot, newlines lost). |
| Microsoft Copilot | `https://copilot.microsoft.com/?q={enc}` | NOT VERIFIED / likely dropped: logged-out request redirects to `/` and strips q, shows sign-in. Treat as unsupported; Copy + open `https://copilot.microsoft.com/`. |
| Mistral Le Chat | `https://chat.mistral.ai/chat?q={enc}` | UNVERIFIED: logged out redirects to `v2.auth.mistral.ai/login`. Product now branded "Vibe Chat" (mistral.ai notice). Need logged-in test; fall back to Copy. |

- **Length:** no official limits except Claude desktop (~14,000 chars). Safe URL budget ~2,000 chars encoded (older proxies/browsers; Zenn notes truncation in some environments); non-ASCII expands 3x-9x. Rule: if encoded URL > 1,900 chars, copy to clipboard and open the model's base URL.
- **Never put secrets/PII in links;** warn that Perplexity sends immediately.

## 9. SEO
- URL: `/p/{slug}` where slug = `kebab-title` + short id suffix (`write-cold-email-7k2`); 301 on title change; category `/c/{cat}`; tag `/t/{tag}` (noindex until >=5 prompts).
- `<link rel="canonical">` to the slug URL; strip query/filter params; SSR/static HTML of prompt body (not JS-only), unique title (<=60 chars) and meta description from first 150 chars + use-case.
- **Structured data:** JSON-LD `CreativeWork` (most honest for text prompts; fields: name, text, author Person, datePublished, dateModified, keywords, inLanguage, license, genre, `interactionStatistic` for copies). Add `BreadcrumbList`; `ItemList` on category pages. Do not use `Recipe`/`HowTo` (HowTo rich results retired by Google: mem, uncertain). 
- **Stars in SERPs:** Google review snippets supported types are Book, Course, Event, LocalBusiness, Movie, Product, Recipe, SoftwareApp (https://developers.google.com/search/docs/appearance/structured-data/review-snippet); CreativeWork alone is not eligible, so `aggregateRating` on a prompt page likely yields no stars. Include only if real, visible, on-page ratings; no fake/self-serving. Low priority.
- Thin/duplicate pages: noindex prompts below quality threshold or with <20 words, user-generated unmoderated content gets `rel="ugc nofollow"` on links. Sitemaps split by 50k URLs with `lastmod`. Add `llms.txt` (optional).

## Uncertain list
- Whether `claude.ai/new?q=` works logged in (unverified; sources conflict). Le Chat/Vibe `?q=` unknown. Copilot `?q=` unknown logged in. ChatGPT `hints`/`temporary-chat` values unverified.
- Competitor details marked (mem): FlowGPT/PromptHero/Snack Prompt/Anthropic/OpenAI libraries; HN gravity constant; HowTo retirement.
- Optimal weights (C, w_*) are priors; tune on real data.
- ChatGPT App SDK tool spec not researched here (see separate doc).
