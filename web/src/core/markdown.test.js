import { describe, expect, it } from "vitest";
import { exportMarkdown, importMarkdown, markdownFileName } from "./markdown.js";

const note = {
  title: "Saturday, Sep 26, 2026 · 22:55",
  dateKey: "2026-09-26",
  mode: "clock",
  duration: 3600,
  remaining: 3000,
  phase: "paused",
  format: { hours: true, minutes: true, seconds: true, tenths: true },
  lines: [
    { text: "First thought", stamp: { kind: "clock", wallClock: "2026-09-26T19:55:43.123Z", remaining: 3000 } },
    { text: "plain\ncontinued", stamp: null },
  ],
};

describe("Markdown portability", () => {
  it("round-trips clock stamps, remaining timer state, detail and soft breaks", () => {
    const parsed = importMarkdown(exportMarkdown(note), note.title);

    expect(parsed.title).toBe(note.title);
    expect(parsed.mode).toBe("clock");
    expect(parsed.duration).toBe(3600);
    expect(parsed.remaining).toBe(3000);
    expect(parsed.format).toEqual(note.format);
    expect(parsed.lines.map(({ text }) => text)).toEqual(["First thought", "plain\ncontinued"]);
    expect(parsed.lines[0].stamp.kind).toBe("clock");
    expect(new Date(parsed.lines[0].stamp.wallClock).toISOString()).toBe(note.lines[0].stamp.wallClock);
  });

  it("keeps unstamped text plain and prefixes wrapped continuation lines", () => {
    const content = exportMarkdown({ ...note, lines: [{ text: "first\nsecond", stamp: null }] });

    expect(content).toContain("first\n  second");
    expect(importMarkdown(content).lines).toEqual([{ text: "first\nsecond", stamp: null }]);
  });

  it("sanitizes exported filenames", () => {
    expect(markdownFileName({ title: "A plan: next / steps", dateKey: "2026-09-28" })).toBe("a-plan-next-steps");
  });
});
