import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { Viewer } from "@/lib/types";

const admin: Viewer = {
  id: "admin1", name: "Admin", email: "a@x.test", image: null, username: "admin", role: "admin",
  trustLevel: 3, createdAt: "2026-01-01T00:00:00.000Z", banned: false,
};

const requireAdminForAction = vi.fn();
vi.mock("@/auth/viewer", () => ({ requireAdminForAction }));

const moderatePrompt = vi.fn();
const moderateComment = vi.fn();
const resolveReport = vi.fn();
const setUserBan = vi.fn();
const setTrustLevel = vi.fn();
vi.mock("@/server/moderation/actions", () => ({ moderatePrompt, moderateComment, resolveReport, setUserBan, setTrustLevel }));

const { revalidatePath } = await import("next/cache");
const actions = await import("@/actions/admin");

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminForAction.mockResolvedValue(admin);
});

describe("admin actions authorization", () => {
  it("returns FORBIDDEN and never calls the server function for non-admins", async () => {
    requireAdminForAction.mockRejectedValue(new AppError("FORBIDDEN", "Not allowed"));
    const r = await actions.moderatePromptAction({ promptId: "p1", action: "approve" });
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(moderatePrompt).not.toHaveBeenCalled();
  });
  it("returns UNAUTHENTICATED for anonymous callers", async () => {
    requireAdminForAction.mockRejectedValue(new AppError("UNAUTHENTICATED", "Please sign in"));
    const r = await actions.setUserBanAction({ userId: "u1", banned: true, reason: "spam" });
    expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(setUserBan).not.toHaveBeenCalled();
  });
});

describe("moderatePromptAction", () => {
  it("passes the admin viewer first and revalidates the admin layout and prompt page", async () => {
    const r = await actions.moderatePromptAction({ promptId: "p1", slug: "hello-abc1234", action: "approve" });
    expect(r.ok).toBe(true);
    expect(moderatePrompt).toHaveBeenCalledWith(admin, "p1", "approve", undefined);
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/p/hello-abc1234");
  });
  it("requires a reason to reject", async () => {
    const r = await actions.moderatePromptAction({ promptId: "p1", action: "reject" });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(moderatePrompt).not.toHaveBeenCalled();
    const ok = await actions.moderatePromptAction({ promptId: "p1", action: "reject", reason: "Contains affiliate links" });
    expect(ok.ok).toBe(true);
    expect(moderatePrompt).toHaveBeenCalledWith(admin, "p1", "reject", "Contains affiliate links");
  });
  it("rejects unknown actions and malformed slugs", async () => {
    // @ts-expect-error invalid action on purpose
    expect(await actions.moderatePromptAction({ promptId: "p1", action: "nuke" })).toMatchObject({ code: "VALIDATION" });
    expect(await actions.moderatePromptAction({ promptId: "p1", slug: "../x", action: "hide" })).toMatchObject({ code: "VALIDATION" });
  });
  it("does not revalidate when the server function fails", async () => {
    moderatePrompt.mockRejectedValue(new AppError("NOT_FOUND", "Prompt not found"));
    const r = await actions.moderatePromptAction({ promptId: "p1", action: "hide" });
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setUserBanAction", () => {
  it("requires a reason to ban but not to unban", async () => {
    expect(await actions.setUserBanAction({ userId: "u1", banned: true, reason: " " })).toMatchObject({ code: "VALIDATION" });
    expect((await actions.setUserBanAction({ userId: "u1", banned: false })).ok).toBe(true);
    expect(setUserBan).toHaveBeenCalledWith(admin, "u1", { banned: false, reason: undefined });
  });
  it("surfaces the server's FORBIDDEN error for a self-ban", async () => {
    setUserBan.mockRejectedValue(new AppError("FORBIDDEN", "You cannot ban yourself"));
    const r = await actions.setUserBanAction({ userId: admin.id, banned: true, reason: "oops" });
    expect(r).toEqual({ ok: false, code: "FORBIDDEN", message: "You cannot ban yourself" });
  });
});

describe("resolveReportAction", () => {
  it("hides the target then resolves as actioned", async () => {
    const calls: string[] = [];
    moderatePrompt.mockImplementation(async () => { calls.push("moderate"); });
    resolveReport.mockImplementation(async () => { calls.push("resolve"); });
    const r = await actions.resolveReportAction({
      resolution: "actioned", reportId: "r1", targetType: "prompt", targetId: "p1", targetAction: "hide", note: "spam",
    });
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["moderate", "resolve"]);
    expect(moderatePrompt).toHaveBeenCalledWith(admin, "p1", "hide", "spam");
    expect(resolveReport).toHaveBeenCalledWith(admin, "r1", "actioned", "spam", { tolerateResolved: true });
  });
  it("moderates comments through moderateComment", async () => {
    await actions.resolveReportAction({
      resolution: "actioned", reportId: "r1", targetType: "comment", targetId: "c1", targetAction: "remove",
    });
    expect(moderateComment).toHaveBeenCalledWith(admin, "c1", "remove", undefined);
  });
  it("does not touch the target for user reports or dismissals", async () => {
    await actions.resolveReportAction({
      resolution: "actioned", reportId: "r1", targetType: "user", targetId: "u1", targetAction: "none",
    });
    await actions.resolveReportAction({ resolution: "dismissed", reportId: "r2", note: "not an issue" });
    expect(moderatePrompt).not.toHaveBeenCalled();
    expect(moderateComment).not.toHaveBeenCalled();
    expect(resolveReport).toHaveBeenNthCalledWith(2, admin, "r2", "dismissed", "not an issue", { tolerateResolved: false });
  });
  it("does not resolve the report if moderating the target fails", async () => {
    moderatePrompt.mockRejectedValue(new AppError("NOT_FOUND", "gone"));
    const r = await actions.resolveReportAction({
      resolution: "actioned", reportId: "r1", targetType: "prompt", targetId: "p1", targetAction: "hide",
    });
    expect(r.ok).toBe(false);
    expect(resolveReport).not.toHaveBeenCalled();
  });
});

describe("setTrustLevelAction", () => {
  it("accepts 0-2 only", async () => {
    expect((await actions.setTrustLevelAction({ userId: "u1", level: 2 })).ok).toBe(true);
    expect(setTrustLevel).toHaveBeenCalledWith(admin, "u1", 2);
    // @ts-expect-error level 3 is not assignable from the admin UI
    expect(await actions.setTrustLevelAction({ userId: "u1", level: 3 })).toMatchObject({ code: "VALIDATION" });
  });
});
