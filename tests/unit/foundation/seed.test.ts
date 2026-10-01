import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateAll } from "../../../scripts/seed";
import { validateSeedFiles } from "../../../scripts/seed-schema";

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const EXPECTED_CATEGORIES = [
  "writing:Writing", "marketing-seo:Marketing & SEO", "coding:Coding", "data-analysis:Data & Analysis",
  "business-strategy:Business & Strategy", "research-learning:Research & Learning", "productivity:Productivity",
  "career:Career", "customer-support:Customer Support", "creative-fiction:Creative & Fiction",
  "personal-life:Personal & Life", "image-video:Image & Video Gen",
];

describe("content/categories.json", () => {
  it("has exactly the 12 categories in order", () => {
    const cats = json("content/categories.json") as { slug: string; name: string; sortOrder: number }[];
    expect(cats.map((c) => `${c.slug}:${c.name}`)).toEqual(EXPECTED_CATEGORIES);
    expect(cats.map((c) => c.sortOrder)).toEqual(cats.map((_, i) => i + 1));
  });
});

describe("content/tags.json", () => {
  const tags = json("content/tags.json") as { slug: string; name: string }[];
  it("has 60-80 unique canonical tags with valid slugs", () => {
    expect(tags.length).toBeGreaterThanOrEqual(60);
    expect(tags.length).toBeLessThanOrEqual(80);
    expect(new Set(tags.map((t) => t.slug)).size).toBe(tags.length);
    for (const t of tags) expect(t.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
  it("has no near-duplicates (same slug ignoring dashes, or simple plurals)", () => {
    const squash = (s: string) => s.replace(/-/g, "").replace(/s$/, "");
    expect(new Set(tags.map((t) => squash(t.slug))).size).toBe(tags.length);
  });
});

describe("seed validation", () => {
  it("fixtures: 12 prompts, one per category, at least 6 with variables", () => {
    const v = validateAll({ fixtures: true });
    expect(v.errors).toEqual([]);
    expect(v.prompts).toHaveLength(12);
    expect(new Set(v.prompts.map((p) => p.categorySlug)).size).toBe(12);
    expect(v.prompts.filter((p) => p.variables.length > 0).length).toBeGreaterThanOrEqual(6);
    expect(v.warnings).toEqual([]);   // every fixture tag is canonical
  });

  const base = {
    key: "writing-x-one", title: "A valid seed title", description: "A description long enough to pass validation.",
    body: "Write about {{topic}} in a friendly voice for a general audience, please.",
    variables: [{ key: "topic", label: "Topic", type: "text", required: true }],
    exampleOutput: "An example.", useCase: "generate", tags: ["email"],
  };
  const run = (file: unknown, tagSet = new Set(["email"])) =>
    validateSeedFiles([{ name: "f.json", data: file }], new Set(["writing"]), tagSet);

  it("accepts a valid file and normalizes the body", () => {
    const r = run({ category: "writing", prompts: [{ ...base, body: "Write about {{ topic : text }} in a friendly voice for everyone." }] });
    expect(r.errors).toEqual([]);
    expect(r.prompts[0]?.body).toContain("{{topic}}");
  });
  it("rejects an undeclared variable, a bad key prefix, duplicate keys and unknown categories", () => {
    expect(run({ category: "writing", prompts: [{ ...base, variables: [] }] }).errors.join()).toMatch(/not declared/);
    expect(run({ category: "writing", prompts: [{ ...base, key: "coding-x" }] }).errors.join()).toMatch(/must start with/);
    expect(run({ category: "writing", prompts: [base, base] }).errors.join()).toMatch(/duplicate key/);
    expect(run({ category: "nope", prompts: [] }).errors.join()).toMatch(/unknown category/);
  });
  it("rejects a missing exampleOutput", () => {
    const { exampleOutput: _drop, ...rest } = base;
    void _drop;
    expect(run({ category: "writing", prompts: [rest] }).errors.length).toBeGreaterThan(0);
  });
  it("only WARNS about non-canonical tags", () => {
    const r = run({ category: "writing", prompts: [{ ...base, tags: ["email", "brand-new-tag"] }] });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/brand-new-tag/);
  });
});
