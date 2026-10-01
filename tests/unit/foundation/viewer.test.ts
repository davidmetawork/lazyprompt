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

  it("requireViewer redirects a banned user to /suspended", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const row = {
      id: "u1", name: "N", email: "n@e.co", image: null, role: "user", banned: true, banExpires: null,
      createdAt: new Date(), username: "n", trustLevel: 1,
    };
    const q: Record<string, unknown> = {};
    for (const m of ["from", "leftJoin", "where"]) q[m] = () => q;
    q.limit = async () => [row];
    (await import("@/db")).db.select = (() => q) as never;
    await expect(requireViewer("/submit")).rejects.toMatchObject({ digest: expect.stringContaining("/suspended") });
  });

  it("requireViewerForAction throws BANNED (never navigates) for a banned user", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const row = {
      id: "u1", name: "N", email: "n@e.co", image: null, role: "user", banned: true, banExpires: null,
      createdAt: new Date(), username: "n", trustLevel: 1,
    };
    const q: Record<string, unknown> = {};
    for (const m of ["from", "leftJoin", "where"]) q[m] = () => q;
    q.limit = async () => [row];
    (await import("@/db")).db.select = (() => q) as never;
    await expect(requireViewerForAction()).rejects.toMatchObject({ name: "AppError", code: "BANNED" });
    await expect(requireAdminForAction()).rejects.toMatchObject({ code: "BANNED" });
  });

  it("requireAdmin calls notFound()", async () => {
    await expect(requireAdmin()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
