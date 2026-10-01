import { beforeEach, describe, expect, it, vi } from "vitest";

const where = vi.fn().mockResolvedValue(undefined);
const set = vi.fn(() => ({ where }));
const update = vi.fn(() => ({ set }));
vi.mock("@/db", () => ({ db: { update } }));

const { promoteIfAdmin } = await import("@/auth/promote");

describe("promoteIfAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = "Boss@Example.com";
  });

  it("promotes a verified ADMIN_EMAILS address", async () => {
    await promoteIfAdmin("u1", "boss@example.com", true);
    expect(set).toHaveBeenCalledWith({ role: "admin" });
  });

  it("does not promote an unverified ADMIN_EMAILS address", async () => {
    await promoteIfAdmin("u1", "boss@example.com", false);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not promote a verified address that is not listed", async () => {
    await promoteIfAdmin("u2", "other@example.com", true);
    expect(update).not.toHaveBeenCalled();
  });
});
