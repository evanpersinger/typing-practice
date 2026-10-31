import { describe, expect, it } from "vitest";
import { dayStreak, localDay } from "./streak";

describe("dayStreak", () => {
  it("counts the days in a row up to today", () => {
    expect(dayStreak(["2026-10-29", "2026-10-30", "2026-10-31"], "2026-10-31")).toBe(3);
  });

  it("keeps the streak alive when you haven't practiced yet today", () => {
    expect(dayStreak(["2026-10-29", "2026-10-30"], "2026-10-31")).toBe(2);
  });

  it("is 0 once a whole day has been missed", () => {
    expect(dayStreak(["2026-10-28", "2026-10-29"], "2026-10-31")).toBe(0);
    expect(dayStreak([], "2026-10-31")).toBe(0);
  });

  it("stops at a gap", () => {
    expect(dayStreak(["2026-10-25", "2026-10-29", "2026-10-30", "2026-10-31"], "2026-10-31")).toBe(3);
  });

  it("crosses a month and a year", () => {
    expect(dayStreak(["2026-12-31", "2027-01-01", "2027-01-02"], "2027-01-02")).toBe(3);
    expect(dayStreak(["2026-02-28", "2026-03-01"], "2026-03-01")).toBe(2);
  });

  it("crosses a leap day and a daylight saving change", () => {
    expect(dayStreak(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01")).toBe(3);
    expect(dayStreak(["2026-03-07", "2026-03-08", "2026-03-09"], "2026-03-09")).toBe(3);
    expect(dayStreak(["2026-10-31", "2026-11-01", "2026-11-02"], "2026-11-02")).toBe(3);
  });

  it("ignores the same day twice", () => {
    expect(dayStreak(["2026-10-31", "2026-10-31"], "2026-10-31")).toBe(1);
  });
});

describe("localDay", () => {
  it("pads the month and day", () => {
    expect(localDay(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});
