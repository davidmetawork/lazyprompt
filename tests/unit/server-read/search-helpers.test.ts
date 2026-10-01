import { describe, expect, it } from "vitest";
import { escapeLike } from "@/server/search/like";
import { damerauLevenshtein, maxTypoDistance, pickCorrection, tokenize } from "@/server/search/typo";

describe("escapeLike", () => {
  it("escapes %, _ and backslash and leaves other text alone", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c:\\dir")).toBe("c:\\\\dir");
    expect(escapeLike("plain text")).toBe("plain text");
  });
});

describe("damerauLevenshtein", () => {
  it("counts insert, delete, substitute and adjacent transposition as one edit", () => {
    expect(damerauLevenshtein("email", "email")).toBe(0);
    expect(damerauLevenshtein("emial", "email")).toBe(1);
    expect(damerauLevenshtein("emal", "email")).toBe(1);
    expect(damerauLevenshtein("emails", "email")).toBe(1);
    expect(damerauLevenshtein("emeil", "email")).toBe(1);
    expect(damerauLevenshtein("kitten", "sitting")).toBe(3);
  });

  it("handles empty strings", () => {
    expect(damerauLevenshtein("", "abc")).toBe(3);
    expect(damerauLevenshtein("abc", "")).toBe(3);
  });
});

describe("tokenize / maxTypoDistance", () => {
  it("lowercases, splits on non-alphanumerics and caps at 6 tokens", () => {
    expect(tokenize("Cold E-mail, OPENER!")).toEqual(["cold", "e", "mail", "opener"]);
    expect(tokenize("a b c d e f g h")).toHaveLength(6);
    expect(tokenize("%%%")).toEqual([]);
  });

  it("allows 0/1/2 edits by word length", () => {
    expect([maxTypoDistance(3), maxTypoDistance(5), maxTypoDistance(6)]).toEqual([0, 1, 2]);
  });
});

describe("pickCorrection", () => {
  const vocab = [{ word: "email", n: 3 }, { word: "emails", n: 9 }, { word: "mail", n: 1 }];

  it("keeps a token that exists in the vocabulary", () => {
    expect(pickCorrection("email", vocab)).toBe("email");
  });

  it("picks the closest word, breaking ties by frequency", () => {
    expect(pickCorrection("emial", vocab)).toBe("email");
    expect(pickCorrection("emaill", [{ word: "email", n: 1 }, { word: "emails", n: 5 }])).toBe("emails");
  });

  it("leaves short tokens and far-off tokens alone", () => {
    expect(pickCorrection("cat", [{ word: "car", n: 1 }])).toBe("cat");
    expect(pickCorrection("zzzzz", vocab)).toBe("zzzzz");
  });
});
