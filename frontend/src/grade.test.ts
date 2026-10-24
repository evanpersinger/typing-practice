import { describe, expect, it } from "vitest";
import { normalize, reachedEnd } from "./grade";

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

describe("reachedEnd", () => {
  it.each([
    ["Keep it.", "Keep it.", true],
    ["keep it.", "KEEP IT.", true], // case doesn't matter
    ["Keeep it.", "Keep it.", true], // an extra letter early, then the period
    ["Keep it", "Keep it.", false], // one short, period not typed yet
    ["Keeep it", "Keep it.", false], // long enough, but not on the last character
    ["Keep it,", "Keep it.", false], // wrong final character
    ["Mrs.", "Mrs. Smith left.", false], // a mid-sentence period is not the end
  ])("typed %j against %j is %s", (typed, sentence, expected) => {
    expect(reachedEnd(typed, sentence)).toBe(expected);
  });
});
