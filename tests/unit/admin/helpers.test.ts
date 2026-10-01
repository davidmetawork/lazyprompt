import { describe, expect, it } from "vitest";
import {
  firstParam, flagLabel, formatAge, formatDateTime, groupReportsByTarget, pageParam, parseReportStatus,
  reportReasonLabel, slugFromHref,
} from "@/components/admin/helpers";
import type { ReportItem } from "@/lib/types";

function report(over: Partial<ReportItem> & { id: string }): ReportItem {
  return {
    targetType: "prompt", targetId: "p1", reason: "spam", details: null, status: "open",
    reporter: { id: "u1", username: "rep", name: "Rep", image: null, isSystem: false },
    target: { label: "A prompt", href: "/p/a-prompt-abc1234", status: "published" },
    createdAt: "2026-01-01T00:00:00.000Z", sameTargetOpenCount: 1, ...over,
  };
}

describe("flagLabel", () => {
  it("maps every screening flag to a readable label", () => {
    expect(flagLabel("too_many_links")).toBe("Too many links");
    expect(flagLabel("openai_flagged")).toBe("Flagged by moderation AI");
    expect(flagLabel("jailbreak")).toBe("Jailbreak pattern");
  });
  it("falls back to a humanised slug for unknown flags", () => {
    expect(flagLabel("some_new-flag")).toBe("Some new flag");
    expect(flagLabel("")).toBe("Unknown flag");
  });
});

describe("reportReasonLabel", () => {
  it("labels known reasons and humanises unknown ones", () => {
    expect(reportReasonLabel("personal_data")).toBe("Personal data");
    expect(reportReasonLabel("weird_thing")).toBe("Weird thing");
  });
});

describe("groupReportsByTarget", () => {
  it("groups by target type and id, preserving order", () => {
    const groups = groupReportsByTarget([
      report({ id: "r1", targetId: "p1", sameTargetOpenCount: 2 }),
      report({ id: "r2", targetType: "comment", targetId: "p1", sameTargetOpenCount: 1 }),
      report({ id: "r3", targetId: "p1", sameTargetOpenCount: 2 }),
      report({ id: "r4", targetId: "p2", sameTargetOpenCount: 1 }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["prompt:p1", "comment:p1", "prompt:p2"]);
    expect(groups[0]!.reports.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(groups[0]!.sameTargetOpenCount).toBe(2);
  });
  it("returns an empty list for no reports", () => {
    expect(groupReportsByTarget([])).toEqual([]);
  });
});

describe("parseReportStatus", () => {
  it("defaults to open and rejects unknown values", () => {
    expect(parseReportStatus(undefined)).toBe("open");
    expect(parseReportStatus("bogus")).toBe("open");
    expect(parseReportStatus("dismissed")).toBe("dismissed");
  });
});

describe("formatAge / formatDateTime", () => {
  const now = Date.parse("2026-03-10T12:00:00.000Z");
  it("formats compact ages", () => {
    expect(formatAge("2026-03-10T11:59:50.000Z", now)).toBe("just now");
    expect(formatAge("2026-03-10T11:30:00.000Z", now)).toBe("30m");
    expect(formatAge("2026-03-10T07:00:00.000Z", now)).toBe("5h");
    expect(formatAge("2026-03-07T12:00:00.000Z", now)).toBe("3d");
    expect(formatAge("2024-03-10T12:00:00.000Z", now)).toBe("2y");
    expect(formatAge("not a date", now)).toBe("unknown");
  });
  it("renders a stable UTC timestamp", () => {
    expect(formatDateTime("2026-03-10T12:34:56.000Z")).toBe("2026-03-10 12:34 UTC");
  });
});

describe("query param helpers", () => {
  it("pageParam clamps to 1..50", () => {
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam("0")).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(pageParam("3")).toBe(3);
    expect(pageParam("999")).toBe(50);
    expect(pageParam(["4", "5"])).toBe(4);
  });
  it("firstParam trims, drops blanks and caps length", () => {
    expect(firstParam("  hi ")).toBe("hi");
    expect(firstParam("   ")).toBeUndefined();
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("x".repeat(500))).toHaveLength(200);
  });
});

describe("slugFromHref", () => {
  it("extracts the slug from prompt links only", () => {
    expect(slugFromHref("/p/my-prompt-abc1234")).toBe("my-prompt-abc1234");
    expect(slugFromHref("/p/my-prompt-abc1234#comment-1")).toBe("my-prompt-abc1234");
    expect(slugFromHref("/u/someone")).toBeUndefined();
    expect(slugFromHref("https://evil.example/p/x")).toBeUndefined();
  });
});
