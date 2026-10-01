import { describe, expect, it } from "vitest";
import { labelFromKey, normalizeTemplate, parseTemplate, renderTemplate } from "@/lib/template";
import type { VariableDef } from "@/lib/types";

const def = (over: Partial<VariableDef> & { key: string }): VariableDef => ({
  label: labelFromKey(over.key), type: "text", required: true, ...over,
});

describe("labelFromKey", () => {
  it("humanizes keys", () => {
    expect(labelFromKey("target_audience")).toBe("Target audience");
    expect(labelFromKey("tone-of-voice")).toBe("Tone of voice");
    expect(labelFromKey("x")).toBe("X");
  });
});

describe("parseTemplate", () => {
  it("finds plain keys in order and counts occurrences", () => {
    const r = parseTemplate("Hi {{name}}, meet {{ other }} and {{name}} again");
    expect(r.errors).toEqual([]);
    expect(r.variables.map((v) => [v.key, v.occurrences])).toEqual([["name", 2], ["other", 1]]);
  });

  it("reads types and defaults", () => {
    const r = parseTemplate("{{a:long}} {{b: number | 5 }} {{c|hello world}}");
    expect(r.variables[0]).toMatchObject({ key: "a", type: "long" });
    expect(r.variables[1]).toMatchObject({ key: "b", type: "number", default: "5" });
    expect(r.variables[2]).toMatchObject({ key: "c", default: "hello world" });
    expect(r.variables[2]?.type).toBeUndefined();
  });

  it("reads select options, trimmed", () => {
    const r = parseTemplate("{{tone:select(warm, formal ,direct)|warm}}");
    expect(r.errors).toEqual([]);
    expect(r.variables[0]).toMatchObject({ key: "tone", type: "select", options: ["warm", "formal", "direct"], default: "warm" });
  });

  it("reports a select with fewer than two options", () => {
    const r = parseTemplate("{{x:select(only)}}");
    expect(r.errors.map((e) => e.kind)).toContain("select_without_options");
  });

  it("treats \\{{ as an escape and ignores it", () => {
    const r = parseTemplate("Use \\{{name}} literally and {{real}}");
    expect(r.variables.map((v) => v.key)).toEqual(["real"]);
    expect(r.errors).toEqual([]);
  });

  it("reports malformed tokens but leaves them as text", () => {
    const r = parseTemplate("{{ }} {{bad key}} {{9nope}} {{ok}} {{x:weird}}");
    expect(r.variables.map((v) => v.key)).toEqual(["ok"]);
    expect(r.errors.filter((e) => e.kind === "malformed")).toHaveLength(4);
  });

  it("first occurrence wins and conflicting later specs produce a warning", () => {
    const r = parseTemplate("{{k:long|a}} then {{k:number|b}}");
    expect(r.variables).toHaveLength(1);
    expect(r.variables[0]).toMatchObject({ type: "long", default: "a", occurrences: 2 });
    expect(r.errors.map((e) => e.kind)).toEqual(["conflict"]);
  });

  it("does not warn when a repeated key is plain", () => {
    expect(parseTemplate("{{k:long}} {{k}}").errors).toEqual([]);
  });

  it("allows at most 20 distinct keys", () => {
    const ok = Array.from({ length: 20 }, (_, i) => `{{k${i}}}`).join(" ");
    const bad = `${ok} {{k20}}`;
    expect(parseTemplate(ok).errors).toEqual([]);
    expect(parseTemplate(bad).errors.map((e) => e.kind)).toContain("too_many");
  });

  it("accepts keys with dashes and underscores, up to 40 chars", () => {
    const long = "a".repeat(40);
    expect(parseTemplate(`{{my-key_1}} {{${long}}}`).variables.map((v) => v.key)).toEqual(["my-key_1", long]);
    expect(parseTemplate(`{{${"a".repeat(41)}}}`).variables).toEqual([]);
  });
});

describe("normalizeTemplate", () => {
  it("rewrites every token to the canonical {{key}} form", () => {
    const r = normalizeTemplate("A {{ x : long | hi }} B {{y|z}} C \\{{keep}}");
    expect(r.body).toBe("A {{x}} B {{y}} C \\{{keep}}");
    expect(r.errors).toEqual([]);
  });

  it("merges inline specs into variable defs with labels and required flags", () => {
    const r = normalizeTemplate("{{target_audience}} {{n:number|3}} {{t:select(a,b)}}");
    expect(r.variables).toEqual([
      { key: "target_audience", label: "Target audience", type: "text", required: true },
      { key: "n", label: "N", type: "number", default: "3", required: false },
      { key: "t", label: "T", type: "select", options: ["a", "b"], required: true },
    ]);
  });

  it("declared defs win over inline specs", () => {
    const declared = [def({ key: "x", type: "long", label: "My X", required: false, default: "d" })];
    const r = normalizeTemplate("{{x:number|9}}", declared);
    expect(r.variables[0]).toEqual(declared[0]);
    expect(r.errors).toEqual([]);
  });

  it("errors on a declared key that the body does not use", () => {
    const r = normalizeTemplate("no variables here", [def({ key: "ghost" })]);
    expect(r.errors).toEqual([expect.objectContaining({ kind: "unused_declared", key: "ghost" })]);
  });

  it("errors on a declared select without options", () => {
    const r = normalizeTemplate("{{s}}", [def({ key: "s", type: "select" })]);
    expect(r.errors.map((e) => e.kind)).toContain("select_without_options");
  });

  it("errors above 20 keys", () => {
    const body = Array.from({ length: 21 }, (_, i) => `{{k${i}}}`).join(" ");
    expect(normalizeTemplate(body).errors.map((e) => e.kind)).toContain("too_many");
  });

  it("is idempotent", () => {
    const once = normalizeTemplate("{{a:long|x}} {{b}}");
    const twice = normalizeTemplate(once.body, once.variables);
    expect(twice.body).toBe(once.body);
    expect(twice.variables).toEqual(once.variables);
    expect(twice.errors).toEqual([]);
  });
});

describe("renderTemplate", () => {
  const defs = [def({ key: "name" }), def({ key: "tone", type: "select", options: ["warm", "formal"], default: "warm", required: false })];

  it("fills values and falls back to defaults", () => {
    const r = renderTemplate("Hi {{name}}, tone: {{tone}}", defs, { name: "Sam" });
    expect(r.text).toBe("Hi Sam, tone: warm");
    expect(r.missing).toEqual([]);
  });

  it("treats whitespace-only values as empty", () => {
    expect(renderTemplate("{{tone}}", defs, { tone: "   " }).text).toBe("warm");
  });

  it("unfilled: label (default) renders [Label] and lists missing required keys", () => {
    const r = renderTemplate("Hi {{name}}", defs, {});
    expect(r.text).toBe("Hi [Name]");
    expect(r.missing).toEqual(["name"]);
  });

  it("unfilled: keep renders {{key}}", () => {
    expect(renderTemplate("Hi {{name}}", defs, {}, { unfilled: "keep" }).text).toBe("Hi {{name}}");
  });

  it("unfilled: empty renders nothing", () => {
    expect(renderTemplate("Hi {{name}}!", defs, {}, { unfilled: "empty" }).text).toBe("Hi !");
  });

  it("does not report optional keys as missing", () => {
    const r = renderTemplate("{{opt}}", [def({ key: "opt", required: false })], {});
    expect(r.missing).toEqual([]);
    expect(r.text).toBe("[Opt]");
  });

  it("repeated keys are all replaced and reported once", () => {
    const r = renderTemplate("{{name}} and {{name}}", defs, {});
    expect(r.text).toBe("[Name] and [Name]");
    expect(r.missing).toEqual(["name"]);
  });

  it("handles a missing defs list by humanizing the key", () => {
    const r = renderTemplate("{{target_audience}}", [], {});
    expect(r.text).toBe("[Target audience]");
    expect(r.missing).toEqual(["target_audience"]);
  });

  it("uses an inline default when the def list does not know the key", () => {
    expect(renderTemplate("{{x|fallback}}", [], {}).text).toBe("fallback");
  });

  it("never re-parses inserted values", () => {
    const r = renderTemplate("A {{name}} B", defs, { name: "{{tone}} \\{{x}}" });
    expect(r.text).toBe("A {{tone}} \\{{x}} B");
  });

  it("renders \\{{ as a literal {{", () => {
    const r = renderTemplate("Write \\{{like this}} for {{name}}", defs, { name: "Sam" });
    expect(r.text).toBe("Write {{like this}} for Sam");
  });

  it("leaves malformed tokens as literal text", () => {
    expect(renderTemplate("{{bad key}} {{name}}", defs, { name: "Sam" }).text).toBe("{{bad key}} Sam");
  });

  it("returns segments for highlighted previews", () => {
    const r = renderTemplate("Hi {{name}}, tone {{tone}}.", defs, { name: "Sam" });
    expect(r.segments).toEqual([
      { kind: "text", text: "Hi " },
      { kind: "var", text: "Sam", key: "name", filled: true },
      { kind: "text", text: ", tone " },
      { kind: "var", text: "warm", key: "tone", filled: true },
      { kind: "text", text: "." },
    ]);
    const unfilled = renderTemplate("{{name}}", defs, {});
    expect(unfilled.segments).toEqual([{ kind: "var", text: "[Name]", key: "name", filled: false }]);
  });

  it("concatenated segments equal the text", () => {
    const r = renderTemplate("a {{name}} b \\{{c}} d", defs, {});
    expect(r.segments.map((s) => s.text).join("")).toBe(r.text);
  });
});
