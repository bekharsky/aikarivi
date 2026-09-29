import { describe, expect, it } from "vitest";
import { changeDuration, makeStamp, remainingAt } from "./time.js";

describe("timer calculations", () => {
  it("counts against the deadline and becomes overtime", () => {
    const note = { phase: "running", remaining: 40, duration: 60 };

    expect(remainingAt(note, 10000, 50000)).toBe(40);
    expect(remainingAt(note, 51000, 50000)).toBe(-1);
  });

  it("adjusts a running session deadline by the duration change", () => {
    const note = { phase: "running", duration: 60, remaining: 30 };
    const adjusted = changeDuration(note, 120, 30, 50000, 20000);

    expect(adjusted).toEqual({ duration: 120, remaining: 90, phase: "running", deadline: 110000 });
  });

  it("uses the same precision state for clock and countdown stamps", () => {
    const date = new Date("2026-09-28T06:42:15.678Z");
    const clockStamp = makeStamp({ mode: "clock", phase: "idle" }, 3600, date);
    const timerStamp = makeStamp({ mode: "countdown", phase: "running" }, 42.5, date);

    expect(clockStamp).toEqual({ kind: "clock", wallClock: date.toISOString(), remaining: null });
    expect(timerStamp).toEqual({ kind: "countdown", wallClock: date.toISOString(), remaining: 42.5 });
  });
});
