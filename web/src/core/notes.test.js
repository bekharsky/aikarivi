import { describe, expect, it } from "vitest";
import { createNote, loadNotebook, normalizeNote, STORAGE_KEY } from "./notes.js";
import { timeBasedTitle } from "./time.js";

describe("local notes", () => {
  it("creates a date and opening-time title immediately", () => {
    const now = new Date("2026-09-28T06:42:15.000Z");
    const note = createNote({ now });

    expect(note.title).toBe(timeBasedTitle(now));
    expect(note.titleAuto).toBe(true);
    expect(note.openedAt).toBe(now.toISOString());
  });

  it("keeps a user-edited title when normalizing a stored note", () => {
    const note = createNote({ id: "custom", title: "Planning", now: new Date("2026-09-28T06:00:00Z") });

    expect(normalizeNote(note).title).toBe("Planning");
    expect(normalizeNote(note).titleAuto).toBe(false);
  });

  it("regenerates legacy clock-only automatic titles from the opening time", () => {
    const note = normalizeNote({
      id: "old",
      title: "22:55",
      openedAt: "2026-09-26T19:55:00.000Z",
      dateKey: "2026-09-26",
      lines: [{ text: "work", stamp: null }],
    });

    const expectedDate = new Date(note.openedAt);
    expectedDate.setHours(22, 55, 0, 0);
    expect(note.title).toBe(timeBasedTitle(expectedDate));
    expect(note.titleAuto).toBe(true);
  });

  it("creates today's note and persists the notebook under the existing key", () => {
    const now = new Date("2026-09-28T06:42:15.000Z");
    const storage = {
      getItem: () => null,
      setItem: () => {},
    };

    const { notebook, storageAvailable } = loadNotebook(storage, now);

    expect(storageAvailable).toBe(true);
    expect(notebook.activeId).toBe("2026-09-28");
    expect(Object.keys(notebook.notes)).toEqual([notebook.activeId]);
    expect(STORAGE_KEY).toBe("aikarivi.web.v1");
  });

  it("pauses a running timer recovered from browser storage", () => {
    const note = normalizeNote({
      id: "running",
      title: "Focus",
      mode: "countdown",
      duration: 3600,
      remaining: 3400,
      phase: "running",
      lines: [{ text: "work", stamp: null }],
    });

    expect(note.phase).toBe("paused");
    expect(note.remaining).toBe(3400);
  });
});
