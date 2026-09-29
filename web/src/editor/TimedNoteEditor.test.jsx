import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_FORMAT } from "../core/time.js";
import { TimedNoteEditor } from "./TimedNoteEditor.jsx";

function EditorHarness({ mode = "countdown", phase = "idle" }) {
  const [note, setNote] = useState({
    id: "note-1",
    mode,
    phase,
    duration: 3600,
    remaining: 3600,
    format: DEFAULT_FORMAT,
    lines: [{ text: "", stamp: null }],
  });
  const stamp = () => mode === "clock"
    ? { kind: "clock", wallClock: "2026-09-28T06:42:15.123Z", remaining: phase === "idle" ? null : 3600 }
    : phase === "running" ? { kind: "countdown", wallClock: "2026-09-28T06:42:15.123Z", remaining: 3600 } : null;
  return (
    <>
      <TimedNoteEditor note={note} stamp={stamp} onLinesChange={(lines) => setNote((current) => ({ ...current, lines }))} />
      <output aria-label="Paragraph model">{JSON.stringify(note.lines)}</output>
      <output aria-label="Timer model">{JSON.stringify({ mode: note.mode, phase: note.phase, duration: note.duration, remaining: note.remaining })}</output>
    </>
  );
}

function paragraphs() {
  return JSON.parse(screen.getByLabelText("Paragraph model").textContent);
}

function timerModel() {
  return JSON.parse(screen.getByLabelText("Timer model").textContent);
}

describe("timed note editor", () => {
  it("keeps idle countdown text unstamped, even after Return", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);
    const input = screen.getByRole("textbox", { name: "Note text" });

    await user.type(input, "first{Enter}second");

    expect(paragraphs().map((line) => line.text)).toEqual(["first", "second"]);
    expect(paragraphs().map((line) => line.stamp)).toEqual([null, null]);
  });

  it("stamps the first typed character in time-of-day mode", async () => {
    const user = userEvent.setup();
    render(<EditorHarness mode="clock" />);

    await user.type(screen.getByRole("textbox", { name: "Note text" }), "first");

    expect(paragraphs()[0].stamp).toMatchObject({ kind: "clock", wallClock: "2026-09-28T06:42:15.123Z" });
  });

  it.each([
    ["Shift+Enter", "{Shift>}{Enter}{/Shift}"],
    ["Command+Enter", "{Meta>}{Enter}{/Meta}"],
  ])("uses %s for a soft break within the same paragraph", async (_label, shortcut) => {
    const user = userEvent.setup();
    render(<EditorHarness mode="clock" />);
    const input = screen.getByRole("textbox", { name: "Note text" });

    await user.type(input, "first");
    await user.keyboard(shortcut);
    await user.type(input, "continued");

    expect(paragraphs()).toHaveLength(1);
    expect(paragraphs()[0].text).toBe("first\ncontinued");
    expect(paragraphs()[0].stamp.kind).toBe("clock");
  });

  it("undo restores the previous text and stamp metadata", async () => {
    const user = userEvent.setup();
    render(<EditorHarness mode="clock" />);
    const input = screen.getByRole("textbox", { name: "Note text" });

    await user.type(input, "a");
    await user.keyboard("{Meta>}z{/Meta}");

    expect(paragraphs()).toEqual([{ text: "", stamp: null }]);
  });

  it("undo changes note text without rolling back the running timer", async () => {
    const user = userEvent.setup();
    render(<EditorHarness phase="running" />);
    const input = screen.getByRole("textbox", { name: "Note text" });
    const before = timerModel();

    await user.type(input, "a");
    await user.keyboard("{Meta>}z{/Meta}");

    expect(paragraphs()).toEqual([{ text: "", stamp: null }]);
    expect(timerModel()).toEqual(before);
  });
});
