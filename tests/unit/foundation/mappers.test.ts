import { describe, expect, it } from "vitest";
import { ratingAverage, toPromptCard, toPromptDetail, type PromptDetailRow } from "@/server/prompts/mappers";

const row: PromptDetailRow = {
  id: "11111111-1111-4111-8111-111111111111", shortId: "abc1234", slug: "a-title-abc1234", title: "A title", description: "Desc",
  useCase: "generate", ratingCount: 4, ratingSum: 17, copyCount: 9, saveCount: 2, commentCount: 1, variableCount: 2,
  isFeatured: true, publishedAt: new Date("2026-01-02T03:04:05Z"), updatedAt: new Date("2026-02-03T00:00:00Z"),
  categorySlug: "writing", categoryName: "Writing", tags: ["email"], models: ["chatgpt"],
  authorId: "u1", authorUsername: "ada", authorName: "Ada", authorImage: null, authorIsSystem: false,
  body: "Body {{x}}", variables: [{ key: "x", label: "X", type: "text", required: true }], exampleOutput: "ex", notes: null,
  license: "cc0", version: 3, status: "published", openCount: 1, workedCount: 2, notWorkedCount: 3, forkCount: 4,
  moderationFlags: ["link"], moderationNote: "note", createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("mappers", () => {
  it("ratingAverage is null without ratings and rounded to 2 decimals otherwise", () => {
    expect(ratingAverage(0, 0)).toBeNull();
    expect(ratingAverage(17, 4)).toBe(4.25);
    expect(ratingAverage(10, 3)).toBe(3.33);
  });

  it("toPromptCard maps to the DTO with ISO strings", () => {
    const c = toPromptCard(row);
    expect(c).toMatchObject({
      shortId: "abc1234", category: { slug: "writing", name: "Writing" }, ratingAvg: 4.25, ratingCount: 4,
      author: { id: "u1", username: "ada", name: "Ada", image: null, isSystem: false },
      publishedAt: "2026-01-02T03:04:05.000Z", variableCount: 2,
    });
    expect(c).not.toHaveProperty("body");
  });

  it("toPromptCard handles an unpublished row and a missing profile", () => {
    const c = toPromptCard({ ...row, publishedAt: null, authorUsername: null, authorIsSystem: null });
    expect(c.publishedAt).toBeNull();
    expect(c.author).toMatchObject({ username: "", isSystem: false });
  });

  const extras = { tags: ["email"], models: ["chatgpt" as const], testedOn: [], forkedFrom: null };

  it("toPromptDetail hides moderation fields from public callers", () => {
    const d = toPromptDetail(row, extras, { includeNonPublic: false });
    expect(d.moderationFlags).toEqual([]);
    expect(d.moderationNote).toBeNull();
    expect(d).toMatchObject({ body: "Body {{x}}", version: 3, license: "cc0", forkCount: 4, createdAt: "2026-01-01T00:00:00.000Z" });
  });

  it("toPromptDetail exposes moderation fields to author/admin callers", () => {
    const d = toPromptDetail(row, extras, { includeNonPublic: true });
    expect(d.moderationFlags).toEqual(["link"]);
    expect(d.moderationNote).toBe("note");
  });
});
