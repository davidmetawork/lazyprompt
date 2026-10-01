import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/auth/server", () => ({ auth: { api: { getSession } } }));
vi.mock("@/db", () => ({ db: {} }));

const { requireViewerForAction, requireAdminForAction, requireViewer, requireAdmin } = await import("@/auth/viewer");

describe("viewer guards for anonymous callers", () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue(null);
  });

  it("requireViewerForAction throws UNAUTHENTICATED", async () => {
    await expect(requireViewerForAction()).rejects.toMatchObject({ name: "AppError", code: "UNAUTHENTICATED" });
  });

  it("requireAdminForAction throws UNAUTHENTICATED", async () => {
    await expect(requireAdminForAction()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("requireViewer redirects to /sign-in?next=", async () => {
    await expect(requireViewer("/submit")).rejects.toMatchObject({
      digest: expect.stringContaining("/sign-in?next=%2Fsubmit"),
    });
  });

  it("requireViewer never redirects to an unsafe next", async () => {
    await expect(requireViewer("//evil.example")).rejects.toMatchObject({
      digest: expect.stringContaining("/sign-in?next=%2F;"),
    });
  });

  it("requireAdmin calls notFound()", async () => {
    await expect(requireAdmin()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
