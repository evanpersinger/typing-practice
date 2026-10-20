import { describe, expect, it } from "vitest";
import type { Drill } from "./api";
import { gradeDrill, normalize } from "./grade";

describe("normalize", () => {
  it.each([
    ["Separate,", "separate"],
    ['"Wait', "wait"],
    ["(maybe)", "maybe"],
    ["can't.", "can't"],
    ["well-known,", "well-known"],
  ])("turns %s into %s", (raw, expected) => {
    expect(normalize(raw)).toBe(expected);
  });
});

describe("gradeDrill", () => {
  const drill: Drill = {
    sentence: "Keep the two files separate.",
    target_words: ["separate"],
  };

  it("marks a correctly typed target word right, keeping what was typed", () => {
    expect(gradeDrill(drill, "Keep the two files separate.")).toEqual([
      { word: "separate", typed: "separate.", correct: true },
    ]);
  });

  it("marks a misspelled target word wrong and records the attempt", () => {
    expect(gradeDrill(drill, "Keep the two files seperate.")).toEqual([
      { word: "separate", typed: "seperate.", correct: false },
    ]);
  });

  it("ignores case and surrounding punctuation on the typed word", () => {
    expect(gradeDrill(drill, "keep the two files SEPARATE")).toEqual([
      { word: "separate", typed: "SEPARATE", correct: true },
    ]);
  });

  it("grades only the target words, in sentence order", () => {
    const twoTargets: Drill = {
      sentence: "A vector is not a variable.",
      target_words: ["variable", "vector"],
    };

    expect(
      gradeDrill(twoTargets, "A vector is not a variable.").map((r) => r.word),
    ).toEqual(["vector", "variable"]);
  });

  it("marks a target wrong when the sentence was left unfinished", () => {
    expect(gradeDrill(drill, "Keep the two")).toEqual([
      { word: "separate", typed: "", correct: false },
    ]);
  });
});
