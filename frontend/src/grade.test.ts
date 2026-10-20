import { describe, expect, it } from "vitest";
import { normalize } from "./grade";

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
