import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import type { Viewer } from "@/lib/types";

const viewer: Viewer = {
  id: "u1", name: "Sam", email: "sam@example.com", image: null, username: "sam", role: "user", trustLevel: 0,
  createdAt: "2026-01-01T00:00:00.000Z", banned: false,
};
const requireViewerForAction = vi.hoisted(() => vi.fn());
vi.mock("@/auth/viewer", () => ({ requireViewerForAction }));
const server = vi.hoisted(() => ({
  createPrompt: vi.fn(), updatePrompt: vi.fn(), deletePrompt: vi.fn(),
  ratePrompt: vi.fn(), removeRating: vi.fn(),
  createComment: vi.fn(), updateComment: vi.fn(), deleteComment: vi.fn(),
  setSaved: vi.fn(), createReport: vi.fn(), updateProfile: vi.fn(),
}));
vi.mock("@/server/prompts/mutations", () => ({ createPrompt: server.createPrompt, updatePrompt: server.updatePrompt, deletePrompt: server.deletePrompt }));
vi.mock("@/server/ratings", () => ({ ratePrompt: server.ratePrompt, removeRating: server.removeRating }));
vi.mock("@/server/comments", () => ({ createComment: server.createComment, updateComment: server.updateComment, deleteComment: server.deleteComment }));
vi.mock("@/server/saves", () => ({ setSaved: server.setSaved }));
vi.mock("@/server/reports", () => ({ createReport: server.createReport }));
vi.mock("@/server/users", () => ({ updateProfile: server.updateProfile }));

import { createCommentAction, deleteCommentAction, updateCommentAction } from "@/actions/comments";
import { createPromptAction, deletePromptAction, updatePromptAction } from "@/actions/prompts";
import { updateProfileAction } from "@/actions/profile";
import { rateAction, removeRatingAction } from "@/actions/ratings";
import { createReportAction } from "@/actions/reports";
import { setSavedAction } from "@/actions/saves";
import { promptValuesToFormData } from "@/components/community/helpers";

const uuid = "11111111-1111-4111-8111-111111111111";
const validPrompt = () => promptValuesToFormData({
  title: "A decent title", description: "A description that is long enough.", body: "Write about {{topic}} in detail please, ok?",
  categorySlug: "writing", useCase: "generate", tags: ["email"], models: [], license: "cc_by_4", exampleOutput: "", notes: "",
  changeNote: "", variables: [{ key: "topic", label: "Topic", type: "text", required: true }],
});

async function redirectOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const d = (e as { digest?: string }).digest;
    return d?.startsWith("NEXT_REDIRECT") ? d.split(";")[2]! : Promise.reject(e);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  requireViewerForAction.mockResolvedValue(viewer);
});

describe("every action turns an anonymous caller into UNAUTHENTICATED (never a redirect)", () => {
  beforeEach(() => {
    requireViewerForAction.mockRejectedValue(new AppError("UNAUTHENTICATED", "Please sign in"));
  });
  const cases: [string, () => Promise<unknown>][] = [
    ["createPromptAction", () => createPromptAction(null, validPrompt())],
    ["updatePromptAction", () => updatePromptAction(null, validPrompt())],
    ["deletePromptAction", () => deletePromptAction({ promptId: uuid, slug: "a-abc1234" })],
    ["rateAction", () => rateAction({ promptId: uuid, stars: 4, slug: "a-abc1234" })],
    ["removeRatingAction", () => removeRatingAction({ promptId: uuid, slug: "a-abc1234" })],
    ["createCommentAction", () => createCommentAction({ promptId: uuid, body: "hi", slug: "a-abc1234" })],
    ["updateCommentAction", () => updateCommentAction({ commentId: uuid, body: "hi", slug: "a-abc1234" })],
    ["deleteCommentAction", () => deleteCommentAction({ commentId: uuid, slug: "a-abc1234" })],
    ["setSavedAction", () => setSavedAction({ promptId: uuid, slug: "a-abc1234", saved: true })],
    ["createReportAction", () => createReportAction({ targetType: "prompt", targetId: uuid, reason: "spam" })],
    ["updateProfileAction", () => updateProfileAction(null, new FormData())],
  ];
  it.each(cases)("%s", async (_name, run) => {
    await expect(run()).resolves.toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
});

describe("prompt actions", () => {
  it("redirects a published prompt to its page, after the mutation", async () => {
    server.createPrompt.mockResolvedValue({ id: uuid, shortId: "abc1234", slug: "a-decent-title-abc1234", status: "published" });
    expect(await redirectOf(createPromptAction(null, validPrompt()))).toBe("/p/a-decent-title-abc1234");
    expect(server.createPrompt).toHaveBeenCalledWith(viewer, expect.objectContaining({ title: "A decent title", tags: ["email"] }));
    expect(revalidatePath).toHaveBeenCalledWith("/u/sam");
  });

  it("redirects a pending prompt to /me/prompts?submitted=1", async () => {
    server.createPrompt.mockResolvedValue({ id: uuid, shortId: "abc1234", slug: "a-abc1234", status: "pending" });
    expect(await redirectOf(createPromptAction(null, validPrompt()))).toBe("/me/prompts?submitted=1");
  });

  it("returns VALIDATION with fieldErrors and does not call the server layer", async () => {
    const fd = validPrompt();
    fd.set("title", "short");
    const r = await createPromptAction(null, fd);
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(!r!.ok && r!.fieldErrors?.title?.length).toBeGreaterThan(0);
    expect(server.createPrompt).not.toHaveBeenCalled();
  });

  it("surfaces RATE_LIMITED without redirecting", async () => {
    server.createPrompt.mockRejectedValue(new AppError("RATE_LIMITED", "Too many prompts today"));
    await expect(createPromptAction(null, validPrompt())).resolves.toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("update needs a valid prompt id and revalidates the old and new slug", async () => {
    const bad = validPrompt();
    await expect(updatePromptAction(null, bad)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    const fd = validPrompt();
    fd.set("promptId", uuid);
    fd.set("slug", "old-title-abc1234");
    server.updatePrompt.mockResolvedValue({ slug: "new-title-abc1234", version: 2, status: "published" });
    expect(await redirectOf(updatePromptAction(null, fd))).toBe("/p/new-title-abc1234");
    expect(revalidatePath).toHaveBeenCalledWith("/p/old-title-abc1234");
    expect(revalidatePath).toHaveBeenCalledWith("/p/new-title-abc1234");
  });

  it("does not revalidate a hostile slug", async () => {
    server.deletePrompt.mockResolvedValue(undefined);
    expect(await redirectOf(deletePromptAction({ promptId: uuid, slug: "../../admin" }))).toBe("/me/prompts");
    expect(revalidatePath).not.toHaveBeenCalledWith("/p/../../admin");
  });

  it("delete returns FORBIDDEN from the server layer instead of redirecting", async () => {
    server.deletePrompt.mockRejectedValue(new AppError("FORBIDDEN", "Not allowed"));
    await expect(deletePromptAction({ promptId: uuid, slug: "a-abc1234" })).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("other actions", () => {
  it("rates and revalidates the prompt page", async () => {
    server.ratePrompt.mockResolvedValue({ ratingAvg: 4, ratingCount: 1, viewerRating: 4 });
    await expect(rateAction({ promptId: uuid, stars: 4, slug: "a-abc1234" })).resolves.toEqual({
      ok: true, data: { ratingAvg: 4, ratingCount: 1, viewerRating: 4 },
    });
    expect(server.ratePrompt).toHaveBeenCalledWith(viewer, uuid, 4);
    expect(revalidatePath).toHaveBeenCalledWith("/p/a-abc1234");
  });

  it("rejects out-of-range stars before touching the server layer", async () => {
    await expect(rateAction({ promptId: uuid, stars: 6, slug: "a-abc1234" })).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(server.ratePrompt).not.toHaveBeenCalled();
  });

  it("passes a reply's parent id through for the server to enforce depth", async () => {
    server.createComment.mockResolvedValue({ id: "c1" });
    const parent = "22222222-2222-4222-8222-222222222222";
    await createCommentAction({ promptId: uuid, parentId: parent, body: "  hello  ", slug: "a-abc1234" });
    expect(server.createComment).toHaveBeenCalledWith(viewer, { promptId: uuid, parentId: parent, body: "hello" });
  });

  it("rejects comments over 2000 characters", async () => {
    await expect(createCommentAction({ promptId: uuid, body: "x".repeat(2001), slug: "a-abc1234" }))
      .resolves.toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("maps a duplicate report to CONFLICT", async () => {
    server.createReport.mockRejectedValue(new AppError("CONFLICT", "You already reported this"));
    await expect(createReportAction({ targetType: "comment", targetId: uuid, reason: "spam" })).resolves.toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("updates the profile with a lowercased username and drops empty optional fields", async () => {
    server.updateProfile.mockResolvedValue({ username: "newname" });
    const fd = new FormData();
    fd.set("username", " NewName "); fd.set("bio", ""); fd.set("website", "");
    await expect(updateProfileAction(null, fd)).resolves.toEqual({ ok: true, data: { username: "newname" } });
    expect(server.updateProfile).toHaveBeenCalledWith(viewer, { username: "newname", bio: undefined, website: undefined });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns CONFLICT for a taken username and VALIDATION for http websites", async () => {
    server.updateProfile.mockRejectedValue(new AppError("CONFLICT", "That username is taken"));
    const fd = new FormData();
    fd.set("username", "taken");
    await expect(updateProfileAction(null, fd)).resolves.toMatchObject({ ok: false, code: "CONFLICT" });
    fd.set("website", "http://insecure.example");
    await expect(updateProfileAction(null, fd)).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
  });
});
