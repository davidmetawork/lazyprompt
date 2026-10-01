import { describe, expect, it, vi } from "vitest";
import { redirect, notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";
import { AppError, notImplemented, toActionResult } from "@/lib/errors";

describe("toActionResult", () => {
  it("wraps a successful value", async () => {
    expect(await toActionResult(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it("propagates redirect() errors instead of mapping them", async () => {
    await expect(toActionResult(async () => redirect("/sign-in"))).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    });
    await expect(toActionResult(async () => permanentRedirect("/x"))).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    });
  });

  it("propagates notFound() errors", async () => {
    await expect(toActionResult(async () => notFound())).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK/),
    });
  });

  it("maps AppError to its code, message and fieldErrors", async () => {
    const r = await toActionResult(async () => {
      throw new AppError("VALIDATION", "Bad input", { title: ["too short"] });
    });
    expect(r).toEqual({ ok: false, code: "VALIDATION", message: "Bad input", fieldErrors: { title: ["too short"] } });
  });

  it("omits fieldErrors when the AppError has none", async () => {
    const r = await toActionResult(async () => { throw new AppError("FORBIDDEN", "Nope"); });
    expect(r).toEqual({ ok: false, code: "FORBIDDEN", message: "Nope" });
  });

  it("maps ZodError to VALIDATION with fieldErrors from issues", async () => {
    const schema = z.object({ title: z.string().min(5), nested: z.object({ n: z.number() }) });
    const r = await toActionResult(async () => schema.parse({ title: "ab", nested: { n: "x" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("VALIDATION");
      expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(["nested.n", "title"]);
    }
  });

  it("maps unknown errors to INTERNAL and logs them", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await toActionResult(async () => { throw new Error("boom"); });
    expect(r).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("notImplemented", () => {
  it("throws naming the function", () => {
    expect(() => notImplemented("fooBar")).toThrow(/fooBar/);
  });
});
