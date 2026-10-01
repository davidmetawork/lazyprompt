import { describe, expect, it } from "vitest";
import {
  applyRating, buildVariables, editWindowOpen, fieldMessages, friendlyMessage, isSafeSlug, overridesFromDefs,
  promptFormDataToInput, promptValuesToFormData, relativeTime, signInHref, toCommentView, type PromptFormValues,
} from "@/components/community/helpers";
import type { CommentNode } from "@/lib/types";
import { promptInputSchema } from "@/lib/validation";

describe("applyRating", () => {
  it("adds a first rating", () => {
    expect(applyRating({ ratingAvg: null, ratingCount: 0, viewerRating: null }, 4)).toEqual({ ratingAvg: 4, ratingCount: 1, viewerRating: 4 });
  });
  it("adds to existing ratings", () => {
    const r = applyRating({ ratingAvg: 4, ratingCount: 2, viewerRating: null }, 1);
    expect(r.ratingCount).toBe(3);
    expect(r.ratingAvg).toBeCloseTo(3);
  });
  it("replaces the viewer's own rating without changing the count", () => {
    const r = applyRating({ ratingAvg: 3, ratingCount: 2, viewerRating: 2 }, 5);
    expect(r).toEqual({ ratingAvg: 4.5, ratingCount: 2, viewerRating: 5 });
  });
  it("clears the viewer's rating and returns null average at zero", () => {
    expect(applyRating({ ratingAvg: 5, ratingCount: 1, viewerRating: 5 }, null)).toEqual({ ratingAvg: null, ratingCount: 0, viewerRating: null });
    const r = applyRating({ ratingAvg: 3, ratingCount: 2, viewerRating: 2 }, null);
    expect(r).toEqual({ ratingAvg: 4, ratingCount: 1, viewerRating: null });
  });
});

describe("buildVariables", () => {
  it("detects inline shorthand", () => {
    const { variables, body, errors } = buildVariables("Tone: {{tone:select(a, b)|a}} for {{ audience }}", {});
    expect(errors).toEqual([]);
    expect(body).toBe("Tone: {{tone}} for {{audience}}");
    expect(variables).toEqual([
      { key: "tone", label: "Tone", type: "select", options: ["a", "b"], default: "a", required: false },
      { key: "audience", label: "Audience", type: "text", required: true },
    ]);
  });
  it("applies author edits over detected values", () => {
    const { variables } = buildVariables("Hi {{name}}", { name: { label: "Your name", type: "long", default: "Sam", help: "Who?" } });
    expect(variables[0]).toEqual({ key: "name", label: "Your name", type: "long", required: false, default: "Sam", help: "Who?" });
  });
  it("keeps spaces typed into a label and falls back when it is blank", () => {
    expect(buildVariables("{{x}}", { x: { label: "My " } }).variables[0]!.label).toBe("My ");
    expect(buildVariables("{{x}}", { x: { label: "  " } }).variables[0]!.label).toBe("X");
  });
  it("reports a select with fewer than two options", () => {
    const { errors } = buildVariables("{{x}}", { x: { type: "select", optionsText: "only" } });
    expect(errors.some((e) => e.kind === "select_without_options")).toBe(true);
  });
  it("reports malformed tokens and drops overrides for variables no longer in the body", () => {
    const r = buildVariables("Use {{not valid!}} here {{ok}}", { gone: { label: "Gone" } });
    expect(r.errors.some((e) => e.kind === "malformed")).toBe(true);
    expect(r.variables.map((v) => v.key)).toEqual(["ok"]);
  });
  it("round trips prefilled definitions", () => {
    const defs = [{ key: "tone", label: "Tone", type: "select" as const, options: ["a", "b"], default: "a", required: false }];
    expect(buildVariables("{{tone}}", overridesFromDefs(defs)).variables).toEqual(defs);
  });
});

describe("form data helpers", () => {
  const values: PromptFormValues = {
    title: "A decent title", description: "A description that is long enough.", body: "Write about {{topic}} in detail please, ok?",
    categorySlug: "writing", useCase: "generate", tags: ["email"], models: ["chatgpt"], license: "cc_by_4",
    exampleOutput: "", notes: "", changeNote: "", variables: [{ key: "topic", label: "Topic", type: "text", required: true }],
    forkedFromShortId: "abc1234",
  };
  it("round trips through FormData and validates with the shared schema", () => {
    const input = promptFormDataToInput(promptValuesToFormData(values));
    expect(input.exampleOutput).toBeUndefined();
    expect(input.forkedFromShortId).toBe("abc1234");
    expect(promptInputSchema.safeParse(input).success).toBe(true);
  });
  it("never throws on malformed JSON fields", () => {
    const fd = promptValuesToFormData(values);
    fd.set("tags", "{oops");
    expect(promptInputSchema.safeParse(promptFormDataToInput(fd)).success).toBe(false);
  });
  it("only includes changeNote when present", () => {
    const fd = promptValuesToFormData({ ...values, changeNote: "Fixed typo" });
    expect(promptFormDataToInput(fd).changeNote).toBe("Fixed typo");
  });
});

describe("small helpers", () => {
  it("signInHref only ever builds same-site next values", () => {
    expect(signInHref("/p/x#rate")).toBe("/sign-in?next=%2Fp%2Fx%23rate");
    expect(signInHref("//evil.com")).toBe("/sign-in?next=%2F");
    expect(signInHref("https://evil.com")).toBe("/sign-in?next=%2F");
  });
  it("isSafeSlug accepts only generated slug shapes", () => {
    expect(isSafeSlug("my-prompt-ab12cd3")).toBe(true);
    expect(isSafeSlug("../admin")).toBe(false);
    expect(isSafeSlug("a/b")).toBe(false);
    expect(isSafeSlug(undefined)).toBe(false);
  });
  it("friendlyMessage rewrites zod length messages", () => {
    expect(friendlyMessage("Too small: expected string to have >=8 characters")).toBe("Use at least 8 characters");
    expect(friendlyMessage("Too big: expected array to have <=5 items")).toBe("Add at most 5");
    expect(friendlyMessage("Something else")).toBe("Something else");
  });
  it("fieldMessages collects nested keys", () => {
    expect(fieldMessages({ tags: ["a"], "tags.1": ["b"], title: ["c"] }, "tags")).toEqual(["a", "b"]);
    expect(fieldMessages(undefined, "tags")).toEqual([]);
  });
});

describe("comment helpers", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  it("formats relative times", () => {
    expect(relativeTime("2026-01-10T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-01-10T11:30:00Z", now)).toBe("30 minutes ago");
    expect(relativeTime("2026-01-10T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-01-08T12:00:00Z", now)).toBe("2 days ago");
    expect(relativeTime("nope", now)).toBe("");
  });
  it("closes the edit window after 24 hours", () => {
    expect(editWindowOpen("2026-01-09T13:00:00Z", now)).toBe(true);
    expect(editWindowOpen("2026-01-09T11:00:00Z", now)).toBe(false);
  });
  it("toCommentView marks only recent own comments editable, recursively", () => {
    const author = { id: "u", username: "u", name: "U", image: null, isSystem: false };
    const node: CommentNode = {
      id: "1", body: "x", status: "visible", author, createdAt: "2026-01-10T11:00:00Z", editedAt: null, isOwn: true,
      replies: [{ id: "2", body: "y", status: "visible", author, createdAt: "2026-01-01T11:00:00Z", editedAt: null, isOwn: true, replies: [] }],
    };
    const v = toCommentView(node, now);
    expect(v.canEdit).toBe(true);
    expect(v.replies[0]!.canEdit).toBe(false);
    expect(v.replies[0]!.timeLabel).toBe("9 days ago");
  });
});
