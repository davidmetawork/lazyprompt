# Seed prompts

One JSON file per category: `content/prompts/<category-slug>.json`. Files starting with `_` are skipped. Categories are defined in `content/categories.json`; the shared tag vocabulary is `content/tags.json`.

```json
{
  "category": "coding",
  "prompts": [
    {
      "key": "coding-pr-review-checklist",
      "title": "Senior engineer pull request review",
      "description": "Get a structured, prioritized code review with concrete fixes, not vague advice.",
      "body": "You are a senior {{language}} engineer reviewing a pull request.\n...\n{{diff}}",
      "variables": [
        { "key": "language", "label": "Language", "type": "select", "options": ["TypeScript", "Python", "Go"], "default": "TypeScript", "required": true },
        { "key": "diff", "label": "Diff or code", "type": "long", "required": true, "help": "Paste the diff" }
      ],
      "exampleOutput": "## Blocking\n1. ...",
      "notes": "Why it works: forces severity ordering...",
      "useCase": "critique",
      "tags": ["code-review", "pull-requests"],
      "models": [],
      "featured": false,
      "license": "cc0"
    }
  ]
}
```

## Field rules

- `key`: globally unique, stable, kebab-case, at most 80 chars, **starts with the category slug** (`coding-...`). It is the upsert key (`prompts.seed_key`).
- `title` 8-100 chars; `description` 20-300 chars.
- `body` 40-8000 chars. Placeholders are `{{key}}` (optionally `{{key:long|default}}`, `{{key:select(a, b)|a}}`); **every key used must be declared in `variables`**. Use `\{{` for a literal `{{`. Bodies are normalized to the canonical `{{key}}` form on load.
- `variables` may be empty. Each: `key`, `label`, `type` (`text` | `long` | `select` | `number`), `required`, optional `options` (select, 2-20), `default`, `help`.
- `exampleOutput` is required (at most 6000 chars) and should be realistic for the default values.
- `notes` optional (at most 2000 chars), recommended ("why it works").
- `useCase`: one of `generate rewrite summarize extract analyze brainstorm plan critique translate tutor roleplay system_prompt`.
- `tags`: 1-5 entries. **Pick from `content/tags.json`.** `pnpm seed:check` prints a warning (not an error) for any tag outside it so near-duplicates like `pr-review` / `codereview` do not creep in.
- `models`: AI models the prompt was written for; `[]` means any model.
- `license`: `cc0` (default for seeds) or `cc_by_4`.
- Do not seed ratings, comments, counters or "tested on" claims.

## Commands

```bash
pnpm seed:check        # validate content/prompts/*.json and tests/fixtures/prompts.json (no DB)
pnpm db:seed           # upsert into DATABASE_URL (idempotent: prints inserted/updated/unchanged)
pnpm db:seed --fixtures
```
