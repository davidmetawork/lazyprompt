import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { JsonLd } from "@/components/seo/json-ld";
import { itemListJsonLd, promptJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import type { PromptDetail } from "@/lib/types";

function prompt(over: Partial<PromptDetail> = {}): PromptDetail {
  const author = { id: "u1", username: "ann", name: "Ann", image: null, isSystem: false };
  return {
    id: "1", shortId: "abc1234", slug: "hello-abc1234", title: "Hello", description: "desc", category: { slug: "coding", name: "Coding" },
    tags: ["a", "b"], models: [], useCase: "generate", author, ratingAvg: 4.5, ratingCount: 3, copyCount: 10, saveCount: 0,
    commentCount: 0, variableCount: 0, isFeatured: false, publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
    body: "body", variables: [], exampleOutput: null, notes: null, license: "cc_by_4", version: 1, status: "published", openCount: 0,
    workedCount: 0, notWorkedCount: 0, forkCount: 0, testedOn: [], forkedFrom: null, moderationFlags: [], moderationNote: null,
    createdAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}

describe("promptJsonLd", () => {
  it("includes aggregateRating only at ratingCount >= 3", () => {
    const [two] = promptJsonLd(prompt({ ratingCount: 2 })) as Record<string, unknown>[];
    const [three] = promptJsonLd(prompt({ ratingCount: 3 })) as Record<string, unknown>[];
    expect(two!.aggregateRating).toBeUndefined();
    expect(three!.aggregateRating).toMatchObject({ ratingCount: 3, ratingValue: 4.5 });
  });

  it("maps license, forks, copies and absolute URLs", () => {
    const [w, b] = promptJsonLd(prompt({ license: "cc0", forkedFrom: { slug: "orig-zzz9999", title: "O", author: prompt().author, version: 1 } })) as [Record<string, any>, Record<string, any>]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(w.license).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
    expect(w.isBasedOn).toMatch(/^https?:\/\/.+\/p\/orig-zzz9999$/);
    expect(w.interactionStatistic.userInteractionCount).toBe(10);
    expect(b["@type"]).toBe("BreadcrumbList");
    expect(JSON.stringify(b)).not.toMatch(/"item":"\//);
  });

  it("builds ItemList and WebSite with SearchAction", () => {
    const list = itemListJsonLd([prompt()], "/c/coding?page=2") as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(list.itemListElement[0].url).toMatch(/^https?:\/\//);
    expect((websiteJsonLd() as Record<string, any>).potentialAction["@type"]).toBe("SearchAction"); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
});

describe("<JsonLd>", () => {
  it("escapes '<' so user content cannot close the script tag", () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data: promptJsonLd(prompt({ title: "</script><img src=x onerror=alert(1)>" })) }));
    expect(html).toContain('type="application/ld+json"');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain("\\u003c/script>");
  });
});
