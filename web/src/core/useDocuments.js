import { useCallback, useEffect, useState } from "react";
import { createNote, loadNotebook, nextNoteId, updateNotebookNote } from "./notes.js";
import { timeBasedTitle } from "./time.js";
import { importMarkdown } from "./markdown.js";

export function useDocuments({ storage = globalThis.localStorage } = {}) {
  const [initial] = useState(() => loadNotebook(storage));
  const [notebook, setNotebook] = useState(initial.notebook);
  const [storageAvailable, setStorageAvailable] = useState(initial.storageAvailable);
  const [saveState, setSaveState] = useState("Saved on this device");

  useEffect(() => {
    try {
      storage?.setItem("aikarivi.web.v1", JSON.stringify(notebook));
      setStorageAvailable(Boolean(storage));
      if (storage) setSaveState("Saved on this device");
    } catch {
      setStorageAvailable(false);
      setSaveState("Storage unavailable");
    }
  }, [notebook, storage]);

  const note = notebook.notes[notebook.activeId];

  const updateNote = useCallback((id, change) => {
    setNotebook((current) => updateNotebookNote(current, id, (previous) => {
      const patch = typeof change === "function" ? change(previous) : change;
      const next = { ...previous, ...patch, updatedAt: new Date().toISOString() };
      if (patch.lines && !next.title.trim() && next.lines.some((line) => line.text.trim())) {
        next.title = timeBasedTitle(new Date(next.openedAt));
        next.titleAuto = true;
      }
      return next;
    }));
    setSaveState("Saved locally");
  }, []);

  const updateActive = useCallback((change) => {
    setNotebook((current) => {
      const id = current.activeId;
      return updateNotebookNote(current, id, (previous) => {
        const patch = typeof change === "function" ? change(previous) : change;
        const next = { ...previous, ...patch, updatedAt: new Date().toISOString() };
        if (patch.lines && !next.title.trim() && next.lines.some((line) => line.text.trim())) {
          next.title = timeBasedTitle(new Date(next.openedAt));
          next.titleAuto = true;
        }
        return next;
      });
    });
    setSaveState("Saved locally");
  }, []);

  const selectDocument = useCallback((id) => {
    setNotebook((current) => current.notes[id]
      ? { ...current, activeId: id, notes: { ...current.notes, [id]: { ...current.notes[id], updatedAt: new Date().toISOString() } } }
      : current);
  }, []);

  const createDocument = useCallback((options = {}, prefix = "note") => {
    const now = new Date();
    setNotebook((current) => {
      const id = options.id || nextNoteId(current.notes, prefix, now.valueOf());
      const created = createNote({
        id,
        mode: current.notes[current.activeId].mode,
        duration: current.notes[current.activeId].duration,
        format: current.notes[current.activeId].format,
        ...options,
        now,
      });
      return { activeId: id, notes: { ...current.notes, [id]: created } };
    });
    setSaveState("Saved locally");
  }, []);

  const importDocument = useCallback((text, title) => {
    const parsed = importMarkdown(text, title);
    return createDocument({
      ...parsed,
      title,
      remaining: parsed.remaining ?? parsed.duration,
      phase: parsed.remaining == null ? "idle" : "paused",
      now: new Date(),
    }, "import");
  }, [createDocument]);

  const titleOnBlur = useCallback(() => {
    if (note.title.trim()) return;
    updateActive({ title: timeBasedTitle(new Date(note.openedAt)), titleAuto: true });
  }, [note.openedAt, note.title, updateActive]);

  const documents = Object.values(notebook.notes).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    note,
    documents,
    storageAvailable,
    saveState,
    updateActive,
    updateNote,
    selectDocument,
    createDocument,
    importDocument,
    titleOnBlur,
  };
}
