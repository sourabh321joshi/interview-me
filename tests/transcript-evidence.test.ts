import { describe, expect, it } from "vitest";
import { highlightQuotes } from "@/app/report/transcript-evidence";

describe("transcript evidence highlights", () => {
  it("matches quoted punctuation and normalized whitespace while preserving the original text", () => {
    const text = "I used React.\nThen I called fetch('/board').";
    expect(highlightQuotes(text, ["“React. Then I called fetch('/board')”"])).toEqual([
      { text: "I used ", highlighted: false },
      { text: "React.\nThen I called fetch('/board')", highlighted: true },
      { text: ".", highlighted: false },
    ]);
  });

  it("merges overlapping quotes without repeating text and ignores empty or case-mismatched quotes", () => {
    expect(highlightQuotes("I reloaded the board from the API.", [
      "reloaded the board", "board from the API", "board from the API", "", "THE API",
    ])).toEqual([
      { text: "I ", highlighted: false },
      { text: "reloaded the board from the API", highlighted: true },
      { text: ".", highlighted: false },
    ]);
  });
});
