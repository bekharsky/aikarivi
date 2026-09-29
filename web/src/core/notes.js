import { DEFAULT_FORMAT, localDateKey, timeBasedTitle } from "./time.js";

export const STORAGE_KEY = "aikarivi.web.v1";

export function createNote({
  id,
  title = "",
  mode = "countdown",
  duration = 3600,
  remaining = duration,
  phase = "idle",
  format = DEFAULT_FORMAT,
  lines,
  now = new Date(),
} = {}) {
  const openedAt = now.toISOString();
  const titleAuto = !String(title).trim();
  return {
    id: id || localDateKey(now),
    title: titleAuto ? timeBasedTitle(now) : String(title),
    titleAuto,
    openedAt,
    dateKey: localDateKey(now),
    mode,
    duration,
    remaining,
    phase,
    format: { ...format },
    lines: lines?.length ? lines.map((line) => ({ ...line })) : [{ text: "", stamp: null }],
    updatedAt: openedAt,
  };
}

export function normalizeNote(source, now = new Date()) {
  const note = { ...source };
  note.title = String(note.title ?? "");
  note.titleAuto = !note.title.trim() || Boolean(note.titleAuto) || /^\d{1,2}:\d{2}$/.test(note.title.trim());
  note.duration = Math.max(1, Number(note.duration) || 3600);
  note.remaining = Number.isFinite(Number(note.remaining)) ? Number(note.remaining) : note.duration;
  note.format = { ...DEFAULT_FORMAT, ...(note.format || {}) };
  note.lines = Array.isArray(note.lines) && note.lines.length
    ? note.lines.map((line) => ({ text: String(line.text ?? ""), stamp: line.stamp || null }))
    : [{ text: "", stamp: null }];

  const firstStampedLine = note.lines.find((line) => line.text.trim() && line.stamp?.wallClock);
  const stampedDate = firstStampedLine ? new Date(firstStampedLine.stamp.wallClock) : null;
  const fallbackDate = new Date(note.updatedAt || `${note.dateKey || localDateKey(now)}T12:00:00`);
  const openedDate = note.openedAt ? new Date(note.openedAt) : null;
  note.openedAt = openedDate && !Number.isNaN(openedDate.valueOf()) ? openedDate.toISOString()
    : stampedDate && !Number.isNaN(stampedDate.valueOf()) ? stampedDate.toISOString()
      : !Number.isNaN(fallbackDate.valueOf()) ? fallbackDate.toISOString() : now.toISOString();
  if (note.titleAuto) {
    const date = new Date(note.openedAt);
    const legacyTime = note.title.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (legacyTime && !Number.isNaN(date.valueOf())) date.setHours(Number(legacyTime[1]), Number(legacyTime[2]), 0, 0);
    if (!Number.isNaN(date.valueOf())) note.title = timeBasedTitle(date);
  }

  if (!["countdown", "clock"].includes(note.mode)) note.mode = "countdown";
  if (!["idle", "running", "paused", "overtime"].includes(note.phase)) note.phase = "idle";
  if (note.phase === "running" || note.phase === "overtime") note.phase = "paused";
  note.id = String(note.id || localDateKey(now));
  note.dateKey = note.dateKey || localDateKey(now);
  note.updatedAt = note.updatedAt || note.openedAt;
  return note;
}

export function loadNotebook(storage = globalThis.localStorage, now = new Date()) {
  let storageAvailable = Boolean(storage);
  try {
    const serialized = storage?.getItem(STORAGE_KEY);
    const saved = serialized ? JSON.parse(serialized) : null;
    if (saved?.notes && typeof saved.notes === "object") {
      const notes = Object.fromEntries(Object.entries(saved.notes).map(([id, note]) => [id, normalizeNote({ ...note, id }, now)]));
      const todayId = localDateKey(now);
      if (!notes[todayId]) notes[todayId] = createNote({ id: todayId, now });
      const activeId = notes[saved.activeId] ? saved.activeId : todayId;
      return { notebook: { activeId, notes }, storageAvailable };
    }
  } catch {
    storageAvailable = false;
  }
  const note = createNote({ now });
  return { notebook: { activeId: note.id, notes: { [note.id]: note } }, storageAvailable };
}

export function nextNoteId(notes, prefix = "note", now = Date.now()) {
  const base = `${prefix}-${now.toString(36)}`;
  let id = base;
  let collision = 1;
  while (notes[id]) id = `${base}-${collision++}`;
  return id;
}

export function updateNotebookNote(notebook, id, change) {
  const previous = notebook.notes[id];
  if (!previous) return notebook;
  const result = typeof change === "function" ? change(previous) : { ...previous, ...change };
  return { ...notebook, notes: { ...notebook.notes, [id]: result } };
}
