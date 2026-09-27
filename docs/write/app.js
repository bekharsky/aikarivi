const STORAGE_KEY = "aikarivi.web.v1";
const MAX_HISTORY = 120;
const $ = (selector) => document.querySelector(selector);
const editor = $("#note-editor");

const history = { undo: [], redo: [], groupKey: "", groupAt: 0 };
let deadline = null;
let tickHandle = null;
let lastTimerPersistAt = 0;
let storageAvailable = true;
let saveMessageHandle = null;

function localDateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function makeNote({ id = localDateKey(), title = "", mode = "countdown", duration = 3600, lines, format } = {}) {
  const openedAt = new Date().toISOString();
  return {
    id,
    title,
    titleAuto: false,
    openedAt,
    dateKey: localDateKey(),
    mode,
    duration,
    remaining: duration,
    phase: "idle",
    format: format || { hours: true, minutes: true, seconds: true, tenths: false },
    lines: lines?.length ? lines : [{ text: "", stamp: null }],
    updatedAt: new Date().toISOString(),
  };
}

function readNotebook() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.notes && typeof parsed.notes === "object") return parsed;
    }
  } catch (_) {
    storageAvailable = false;
  }
  const note = makeNote();
  return { activeId: note.id, notes: { [note.id]: note } };
}

const notebook = readNotebook();
const todayId = localDateKey();
if (!notebook.notes[todayId]) notebook.notes[todayId] = makeNote();
if (!notebook.notes[notebook.activeId]) {
  notebook.activeId = todayId;
}

function activeNote() {
  return notebook.notes[notebook.activeId];
}

function normalizeNote(note) {
  note.title = String(note.title ?? "");
  note.titleAuto = Boolean(note.titleAuto) || /^\d{1,2}:\d{2}$/.test(note.title.trim());
  note.duration = Math.max(1, Number(note.duration) || 3600);
  note.remaining = Number.isFinite(Number(note.remaining)) ? Number(note.remaining) : note.duration;
  if (!note.format || typeof note.format !== "object") note.format = { hours: true, minutes: true, seconds: true, tenths: false };
  if (!Array.isArray(note.lines) || !note.lines.length) note.lines = [{ text: "", stamp: null }];
  note.lines = note.lines.map((line) => ({ text: String(line.text ?? ""), stamp: line.stamp || null }));
  const firstStampedLine = note.lines.find((line) => line.text.trim() && line.stamp?.wallClock);
  const stampedDate = firstStampedLine ? new Date(firstStampedLine.stamp.wallClock) : null;
  const fallbackDate = new Date(note.updatedAt || `${note.dateKey || localDateKey()}T12:00:00`);
  note.openedAt = note.openedAt || (stampedDate && !Number.isNaN(stampedDate.valueOf()) ? stampedDate.toISOString() :
    !Number.isNaN(fallbackDate.valueOf()) ? fallbackDate.toISOString() : new Date().toISOString());
  if (note.titleAuto) {
    const date = new Date(note.openedAt);
    const legacyTime = note.title.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (legacyTime && !Number.isNaN(date.valueOf())) date.setHours(Number(legacyTime[1]), Number(legacyTime[2]), 0, 0);
    if (!Number.isNaN(date.valueOf())) note.title = timeBasedTitle(date);
  }
  if (!["countdown", "clock"].includes(note.mode)) note.mode = "countdown";
  if (!["idle", "running", "paused", "overtime"].includes(note.phase)) note.phase = "idle";
  // A closed browser does not silently consume a session. Reopen it paused at
  // the last locally saved remaining time, matching the Mac app's behavior.
  if (note.phase === "running" || note.phase === "overtime") note.phase = "paused";
  return note;
}

Object.values(notebook.notes).forEach(normalizeNote);
let record = activeNote();

function saveNotebook({ quiet = false } = {}) {
  record.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notebook));
    storageAvailable = true;
    setSaveState(quiet ? "Saved on this device" : "Saved locally");
  } catch (_) {
    storageAvailable = false;
    setSaveState("Browser storage is full");
  }
}

function setSaveState(message) {
  const headerStatus = $("#save-state");
  const footerStatus = $("#autosave-label");
  if (headerStatus) headerStatus.textContent = storageAvailable ? "Only on this device" : "Storage unavailable";
  if (footerStatus) footerStatus.textContent = message;
  clearTimeout(saveMessageHandle);
  if (message === "Saved locally") {
    saveMessageHandle = setTimeout(() => {
      if (footerStatus) footerStatus.textContent = "Saved on this device";
    }, 1400);
  }
}

function formatDuration(value, format = record.format) {
  const activeUnits = [format.hours, format.minutes, format.seconds];
  if (!activeUnits.some(Boolean)) return "";
  const sign = value < 0 ? "−" : "";
  let rest = Math.abs(value);
  rest = format.tenths && format.seconds ? Math.floor(rest * 10) / 10 : Math.floor(rest);
  const parts = [];
  if (format.hours) {
    const unit = Math.floor(rest / 3600);
    rest -= unit * 3600;
    parts.push(String(unit).padStart(2, "0"));
  }
  if (format.minutes) {
    const unit = Math.floor(rest / 60);
    rest -= unit * 60;
    parts.push(String(unit).padStart(2, "0"));
  }
  if (format.seconds) {
    const unit = Math.floor(rest);
    rest -= unit;
    parts.push(String(unit).padStart(2, "0"));
  }
  let result = sign + parts.join(":");
  if (format.tenths && format.seconds) result += `.${Math.min(9, Math.floor(rest * 10))}`;
  return result;
}

function formatClock(date, format = record.format) {
  if (![format.hours, format.minutes, format.seconds].some(Boolean)) return "";
  const parts = [];
  if (format.hours) parts.push(String(date.getHours()).padStart(2, "0"));
  if (format.minutes) parts.push(String(date.getMinutes()).padStart(2, "0"));
  if (format.seconds) parts.push(String(date.getSeconds()).padStart(2, "0"));
  let result = parts.join(":");
  if (format.tenths && format.seconds) result += `.${Math.floor(date.getMilliseconds() / 100)}`;
  return result;
}

function timeBasedTitle(date = new Date()) {
  const datePart = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "short", day: "numeric", year: "numeric",
  }).format(date);
  return `${datePart} · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function assignTimeBasedTitle(note = record, date = new Date()) {
  if (note.title.trim()) return false;
  note.title = timeBasedTitle(date);
  note.titleAuto = true;
  if (note === record) {
    $("#task-title").value = note.title;
    updateNotePicker();
  }
  return true;
}

function dateForUntitledNote(note) {
  const openedDate = new Date(note.openedAt);
  if (!Number.isNaN(openedDate.valueOf())) return openedDate;
  const firstStampedLine = note.lines.find((line) => line.text.trim() && line.stamp?.wallClock);
  const stampedDate = firstStampedLine ? new Date(firstStampedLine.stamp.wallClock) : null;
  if (stampedDate && !Number.isNaN(stampedDate.valueOf())) return stampedDate;
  const updatedDate = new Date(note.updatedAt);
  return Number.isNaN(updatedDate.valueOf()) ? new Date() : updatedDate;
}

function currentRemaining() {
  if (record.phase === "running" || record.phase === "overtime") {
    return deadline === null ? record.remaining : (deadline - Date.now()) / 1000;
  }
  return record.phase === "paused" ? record.remaining : record.duration;
}

function makeStamp() {
  const wallClock = new Date().toISOString();
  const active = record.phase === "running" || record.phase === "overtime";
  if (record.mode === "clock") {
    return {
      kind: "clock",
      wallClock,
      remaining: record.phase === "idle" ? null : currentRemaining(),
    };
  }
  if (!active) return null;
  return { kind: "countdown", wallClock, remaining: currentRemaining() };
}

function formatStamp(stamp) {
  if (!stamp) return "";
  if (stamp.kind === "clock") {
    const date = stamp.wallClock ? new Date(stamp.wallClock) : null;
    return date && !Number.isNaN(date.valueOf()) ? formatClock(date) : "";
  }
  return stamp.remaining == null ? "" : formatDuration(Number(stamp.remaining));
}

function updateTimerDisplay() {
  const phase = record.phase;
  const active = phase === "running" || phase === "overtime";
  if (record.mode === "clock") {
    const clockReadout = $("#clock-readout");
    clockReadout.textContent = formatClock(new Date());
    clockReadout.setAttribute("aria-label", `Local time ${clockReadout.textContent}`);
  } else {
    const remaining = currentRemaining();
    if (active && remaining <= 0 && phase !== "overtime") record.phase = "overtime";
    if (active && remaining > 0 && phase === "overtime") record.phase = "running";
    const readout = $("#timer-readout");
    readout.textContent = formatDuration(remaining);
    readout.setAttribute("aria-label", `Time remaining ${readout.textContent}`);
    readout.classList.toggle("is-running", active && record.phase !== "overtime");
    readout.classList.toggle("is-overtime", record.phase === "overtime");
  }
  $("#play-button").classList.toggle("is-active", active);
  const label = active ? "Pause timer" : phase === "paused" ? "Resume timer" : "Start timer";
  $("#play-button").setAttribute("aria-label", label);
  $("#play-button").title = label;
  $("#reset-button").disabled = phase === "idle";
  $("#custom-minutes").value = Math.max(1, Math.round(record.duration / 60));
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const selected = button.dataset.mode === record.mode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function setTimerPhaseAfterTick() {
  if (deadline === null) {
    updateTimerDisplay();
    return;
  }
  const remaining = (deadline - Date.now()) / 1000;
  record.remaining = remaining;
  record.phase = remaining <= 0 ? "overtime" : "running";
  updateTimerDisplay();
  if (Date.now() - lastTimerPersistAt >= 1000) {
    lastTimerPersistAt = Date.now();
    saveNotebook({ quiet: true });
  }
}

function ensureTicker() {
  clearInterval(tickHandle);
  lastTimerPersistAt = Date.now();
  const interval = record.mode === "clock"
    ? (record.format.tenths && record.format.seconds ? 100 : 1000)
    : record.format.tenths && record.format.seconds ? 100 : 250;
  tickHandle = setInterval(setTimerPhaseAfterTick, interval);
}

function toggleTimer() {
  if (record.phase === "running" || record.phase === "overtime") {
    record.remaining = currentRemaining();
    record.phase = "paused";
    deadline = null;
  } else if (record.phase === "paused") {
    deadline = Date.now() + record.remaining * 1000;
    record.phase = record.remaining <= 0 ? "overtime" : "running";
  } else {
    record.remaining = record.duration;
    deadline = Date.now() + record.duration * 1000;
    record.phase = "running";
  }
  updateTimerDisplay();
  updateAllStamps();
  saveNotebook();
  ensureTicker();
}

function resetTimer() {
  deadline = null;
  record.remaining = record.duration;
  record.phase = "idle";
  updateTimerDisplay();
  updateAllStamps();
  saveNotebook();
}

function setDuration(seconds) {
  const next = Math.max(1, Math.round(seconds));
  const delta = next - record.duration;
  record.duration = next;
  if (record.phase === "idle") record.remaining = next;
  else if (record.phase === "paused") record.remaining += delta;
  else if (deadline !== null) deadline += delta * 1000;
  if (record.phase === "running" || record.phase === "overtime") {
    record.remaining = currentRemaining();
    record.phase = record.remaining <= 0 ? "overtime" : "running";
  }
  updateTimerDisplay();
  updateAllStamps();
  saveNotebook();
  $("#duration-menu").open = false;
}

function formatDetailLabel() {
  const parts = [];
  if (record.format.hours) parts.push("h");
  if (record.format.minutes) parts.push("m");
  if (record.format.seconds) parts.push(record.format.tenths ? "s.1" : "s");
  return parts.join(":");
}

function setDetailMenuOpen(open) {
  const menu = $("#detail-menu");
  menu.classList.toggle("is-open", open);
  $("#detail-popover").hidden = !open;
  $("#detail-trigger").setAttribute("aria-expanded", String(open));
}

function updateModeAndFormat() {
  document.querySelectorAll("[data-unit]").forEach((button) => {
    const unit = button.dataset.unit;
    const selected = Boolean(record.format[unit]);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    if (unit === "tenths") button.disabled = !record.format.seconds;
  });
  const detailLabel = formatDetailLabel();
  $("#detail-readout").textContent = detailLabel;
  $("#detail-trigger").setAttribute("aria-label", `Timestamp detail ${detailLabel}`);
  const clockMode = record.mode === "clock";
  $("#timer-controls").hidden = clockMode;
  $("#clock-display").hidden = !clockMode;
  $("#detail-menu").hidden = clockMode;
  if (clockMode) {
    $("#duration-menu").open = false;
    setDetailMenuOpen(false);
  }
  updateTimerDisplay();
  updateAllStamps();
  ensureTicker();
}

function makeLineRow(line, index) {
  const row = document.createElement("div");
  row.className = "note-row";
  row.dataset.index = String(index);
  const stamp = document.createElement("div");
  stamp.className = "line-stamp";
  stamp.setAttribute("aria-hidden", "true");
  const textarea = document.createElement("textarea");
  textarea.className = "note-line";
  textarea.rows = 1;
  textarea.value = line.text;
  textarea.dataset.index = String(index);
  textarea.setAttribute("aria-label", `Note line ${index + 1}`);
  textarea.spellcheck = true;
  textarea.autocapitalize = "sentences";
  if (index === 0 && !line.text) textarea.placeholder = "Start writing here…";
  row.append(stamp, textarea);
  editor.append(row);
  resizeTextarea(textarea);
  paintStamp(row, line, index);
}

function renderEditor({ focusIndex, selectionStart, selectionEnd } = {}) {
  editor.replaceChildren();
  if (!record.lines.length) record.lines.push({ text: "", stamp: null });
  record.lines.forEach(makeLineRow);
  updateTimestampLayout();
  updateLineCount();
  if (Number.isInteger(focusIndex)) {
    const target = editor.querySelector(`.note-line[data-index="${focusIndex}"]`);
    if (target) {
      target.focus({ preventScroll: true });
      const start = Math.min(selectionStart ?? target.value.length, target.value.length);
      const end = Math.min(selectionEnd ?? start, target.value.length);
      target.setSelectionRange(start, end);
    }
  }
}

function resizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, parseFloat(getComputedStyle(textarea).lineHeight))}px`;
}

function paintStamp(row, line, index) {
  const stampElement = row.querySelector(".line-stamp");
  const stamp = line.stamp;
  const value = formatStamp(stamp);
  stampElement.textContent = value;
  stampElement.classList.toggle("is-clock", stamp?.kind === "clock" && Boolean(value));
  stampElement.classList.toggle("is-countdown", stamp?.kind === "countdown" && Boolean(value));
  stampElement.classList.toggle("is-overtime", stamp?.kind === "countdown" && Number(stamp.remaining) < 0);
  stampElement.title = value ? `Line started at ${stamp.wallClock ? new Date(stamp.wallClock).toLocaleTimeString() : "a saved time"}` : "";
  row.dataset.index = String(index);
}

function updateTimestampLayout() {
  const stampElements = [...editor.querySelectorAll(".line-stamp:not(:empty)")];
  const hasTimestamps = stampElements.length > 0;
  editor.classList.toggle("has-timestamps", hasTimestamps);
  editor.closest(".note-card")?.classList.toggle("has-timestamps", hasTimestamps);
  if (!hasTimestamps) {
    editor.style.removeProperty("--stamp-width");
    editor.style.removeProperty("--stamp-gap");
    editor.closest(".note-card")?.style.removeProperty("--text-inset");
    return;
  }

  const sampleDate = new Date(2000, 0, 1, 23, 59, 59, 900);
  const samples = [
    formatClock(sampleDate),
    formatDuration(24 * 60 * 60),
    formatDuration(-24 * 60 * 60),
  ].filter(Boolean);
  const context = document.createElement("canvas").getContext("2d");
  const stampFont = getComputedStyle(editor.querySelector(".line-stamp")).font;
  let width;
  if (context) {
    context.font = stampFont;
    width = Math.ceil(Math.max(...samples.map((sample) => context.measureText(sample).width)) + 6);
  } else {
    width = Math.max(...samples.map((sample) => sample.length * 6));
  }
  const gap = matchMedia("(max-width: 600px)").matches ? 8 : 10;
  editor.style.setProperty("--stamp-width", `${width}px`);
  editor.style.setProperty("--stamp-gap", `${gap}px`);
  editor.closest(".note-card")?.style.setProperty("--text-inset", `${width + gap}px`);
}

function updateAllStamps() {
  editor.querySelectorAll(".note-row").forEach((row) => {
    const index = Number(row.dataset.index);
    if (record.lines[index]) paintStamp(row, record.lines[index], index);
  });
  updateTimestampLayout();
}

function updateLineCount() {
  const count = record.lines.filter((line) => line.text.trim().length > 0).length;
  $("#line-count").textContent = `${count} ${count === 1 ? "line" : "lines"}`;
}

function updateNotePicker() {
  const picker = $("#note-picker");
  const notes = Object.values(notebook.notes).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  picker.replaceChildren();
  notes.forEach((note) => {
    const option = document.createElement("option");
    option.value = note.id;
    const date = note.dateKey ? new Date(`${note.dateKey}T12:00:00`) : new Date(note.updatedAt);
    const dateLabel = Number.isNaN(date.valueOf()) ? "Saved note" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
    const fallback = `${note.id === localDateKey() ? "Today" : "Note"} · ${dateLabel}`;
    option.textContent = note.id === notebook.activeId
      ? (note.id === localDateKey() ? `Today · ${dateLabel}` : dateLabel)
      : (note.title.trim() ? `${note.title.trim()} · ${dateLabel}` : fallback);
    picker.append(option);
  });
  picker.value = notebook.activeId;
}

function resetHistory() {
  history.undo = [];
  history.redo = [];
  history.groupKey = "";
  history.groupAt = 0;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const undoButton = $("#undo-button");
  const redoButton = $("#redo-button");
  if (undoButton) undoButton.disabled = history.undo.length === 0;
  if (redoButton) redoButton.disabled = history.redo.length === 0;
}

function cursorSnapshot(textarea) {
  return {
    noteId: notebook.activeId,
    lines: record.lines.map((line) => ({ text: line.text, stamp: line.stamp ? { ...line.stamp } : null })),
    index: Number(textarea?.dataset.index ?? 0),
    start: textarea?.selectionStart ?? 0,
    end: textarea?.selectionEnd ?? 0,
  };
}

function captureHistory(textarea, groupKey = "") {
  const now = Date.now();
  if (groupKey && history.groupKey === groupKey && now - history.groupAt < 850) {
    history.groupAt = now;
    return;
  }
  history.undo.push(cursorSnapshot(textarea));
  if (history.undo.length > MAX_HISTORY) history.undo.shift();
  history.redo = [];
  history.groupKey = groupKey;
  history.groupAt = now;
  updateHistoryButtons();
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot || snapshot.noteId !== notebook.activeId) return;
  record.lines = snapshot.lines.map((line) => ({ text: line.text, stamp: line.stamp ? { ...line.stamp } : null }));
  renderEditor({ focusIndex: snapshot.index, selectionStart: snapshot.start, selectionEnd: snapshot.end });
  saveNotebook();
}

function undo() {
  if (!history.undo.length) return;
  history.redo.push(cursorSnapshot(editor.querySelector(".note-line:focus")));
  applyHistorySnapshot(history.undo.pop());
  history.groupKey = "";
  updateHistoryButtons();
}

function redo() {
  if (!history.redo.length) return;
  history.undo.push(cursorSnapshot(editor.querySelector(".note-line:focus")));
  applyHistorySnapshot(history.redo.pop());
  history.groupKey = "";
  updateHistoryButtons();
}

function switchNote(id) {
  if (!notebook.notes[id] || id === notebook.activeId) return;
  if (deadline !== null) {
    record.remaining = currentRemaining();
    record.phase = "paused";
    deadline = null;
  }
  notebook.activeId = id;
  record = normalizeNote(activeNote());
  deadline = null;
  resetHistory();
  if (!record.title.trim() && record.lines.some((line) => line.text.trim())) {
    assignTimeBasedTitle(record, dateForUntitledNote(record));
  }
  $("#task-title").value = record.title;
  updateNotePicker();
  updateModeAndFormat();
  renderEditor();
  updateTimerDisplay();
  saveNotebook({ quiet: true });
}

function startNewNote() {
  const dateKey = localDateKey();
  let id = `note-${Date.now().toString(36)}`;
  while (notebook.notes[id]) id = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const note = makeNote({ id });
  note.dateKey = dateKey;
  notebook.notes[id] = note;
  notebook.activeId = id;
  record = note;
  deadline = null;
  resetHistory();
  $("#task-title").value = "";
  updateNotePicker();
  updateModeAndFormat();
  renderEditor({ focusIndex: 0, selectionStart: 0, selectionEnd: 0 });
  updateTimerDisplay();
  saveNotebook();
}

function onBeforeInput(event) {
  const textarea = event.target.closest(".note-line");
  if (!textarea) return;
  if (event.inputType === "historyUndo") {
    event.preventDefault();
    undo();
    return;
  }
  if (event.inputType === "historyRedo") {
    event.preventDefault();
    redo();
    return;
  }
  const groupable = event.inputType === "insertText" || event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward";
  const groupKey = groupable ? `${notebook.activeId}:${textarea.dataset.index}:${event.inputType}` : "";
  captureHistory(textarea, groupKey);
}

function onInput(event) {
  const textarea = event.target.closest(".note-line");
  if (!textarea) return;
  const index = Number(textarea.dataset.index);
  const line = record.lines[index];
  if (!line) return;
  const hadContent = record.lines.some((entry) => entry.text.trim());
  const oldText = line.text;
  line.text = textarea.value.replace(/\r\n?/g, "\n");
  if (!hadContent && record.lines.some((entry) => entry.text.trim())) assignTimeBasedTitle(record, dateForUntitledNote(record));
  if (!oldText.length && line.text.length && !line.stamp) line.stamp = makeStamp();
  resizeTextarea(textarea);
  paintStamp(textarea.closest(".note-row"), line, index);
  updateTimestampLayout();
  updateLineCount();
  saveNotebook({ quiet: true });
}

function splitLine(textarea) {
  const index = Number(textarea.dataset.index);
  const line = record.lines[index];
  if (!line) return;
  captureHistory(textarea);
  const before = line.text.slice(0, textarea.selectionStart);
  const after = line.text.slice(textarea.selectionEnd);
  line.text = before;
  const nextLine = { text: after, stamp: after.length ? makeStamp() : null };
  record.lines.splice(index + 1, 0, nextLine);
  history.groupKey = "";
  renderEditor({ focusIndex: index + 1, selectionStart: 0, selectionEnd: 0 });
  updateLineCount();
  saveNotebook({ quiet: true });
}

function mergeLine(textarea, direction) {
  const index = Number(textarea.dataset.index);
  const otherIndex = direction === "previous" ? index - 1 : index + 1;
  if (otherIndex < 0 || otherIndex >= record.lines.length) return false;
  const line = record.lines[index];
  const other = record.lines[otherIndex];
  captureHistory(textarea);
  if (direction === "previous") {
    const caret = other.text.length;
    other.text += line.text;
    record.lines.splice(index, 1);
    history.groupKey = "";
    renderEditor({ focusIndex: otherIndex, selectionStart: caret, selectionEnd: caret });
  } else {
    const caret = line.text.length;
    line.text += other.text;
    record.lines.splice(otherIndex, 1);
    history.groupKey = "";
    renderEditor({ focusIndex: index, selectionStart: caret, selectionEnd: caret });
  }
  updateLineCount();
  saveNotebook({ quiet: true });
  return true;
}

function onPaste(event) {
  const textarea = event.target.closest(".note-line");
  const pastedText = event.clipboardData?.getData("text/plain").replace(/\r\n?/g, "\n");
  if (!textarea || !pastedText?.includes("\n")) return;
  event.preventDefault();
  const index = Number(textarea.dataset.index);
  const line = record.lines[index];
  if (!line) return;
  captureHistory(textarea);
  const before = line.text.slice(0, textarea.selectionStart);
  const after = line.text.slice(textarea.selectionEnd);
  const parts = pastedText.split("\n");
  const firstText = before + parts[0];
  const finalText = parts.at(-1) + after;
  const firstStamp = line.stamp || (!line.text.length && firstText.length ? makeStamp() : null);
  const inserted = [{ text: firstText, stamp: firstStamp }];
  for (const text of parts.slice(1, -1)) inserted.push({ text, stamp: text.length ? makeStamp() : null });
  inserted.push({ text: finalText, stamp: finalText.length ? makeStamp() : null });
  record.lines.splice(index, 1, ...inserted);
  if (!record.title.trim() && record.lines.some((entry) => entry.text.trim())) assignTimeBasedTitle(record, dateForUntitledNote(record));
  history.groupKey = "";
  const finalIndex = index + inserted.length - 1;
  renderEditor({ focusIndex: finalIndex, selectionStart: parts.at(-1).length, selectionEnd: parts.at(-1).length });
  updateLineCount();
  saveNotebook({ quiet: true });
}

function onEditorKeyDown(event) {
  const textarea = event.target.closest(".note-line");
  if (!textarea) return;
  const index = Number(textarea.dataset.index);
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    splitLine(textarea);
    return;
  }
  if (event.key === "Backspace" && textarea.selectionStart === 0 && textarea.selectionEnd === 0 && index > 0) {
    event.preventDefault();
    mergeLine(textarea, "previous");
    return;
  }
  if (event.key === "Delete" && textarea.selectionStart === textarea.value.length && textarea.selectionEnd === textarea.value.length && index < record.lines.length - 1) {
    event.preventDefault();
    mergeLine(textarea, "next");
    return;
  }
  if (event.key === "ArrowUp" && textarea.selectionStart === 0 && textarea.selectionEnd === 0 && index > 0) {
    event.preventDefault();
    const previous = editor.querySelector(`.note-line[data-index="${index - 1}"]`);
    previous.focus();
    previous.setSelectionRange(previous.value.length, previous.value.length);
  }
  if (event.key === "ArrowDown" && textarea.selectionStart === textarea.value.length && textarea.selectionEnd === textarea.value.length && index < record.lines.length - 1) {
    event.preventDefault();
    const next = editor.querySelector(`.note-line[data-index="${index + 1}"]`);
    next.focus();
    next.setSelectionRange(0, 0);
  }
}

function exactDuration(value) {
  const totalMs = Math.round(Math.abs(Number(value)) * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor(totalMs / 60000) % 60;
  const seconds = (totalMs % 60000) / 1000;
  const sec = seconds.toFixed(3).padStart(6, "0");
  return `${Number(value) < 0 ? "-" : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${sec}`;
}

function clockField(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.valueOf())) return "";
  const pad = (number, length = 2) => String(number).padStart(length, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function detailField(format) {
  const units = [];
  if (format.hours) units.push("h");
  if (format.minutes) units.push("m");
  if (format.seconds) units.push(format.tenths ? "s.1" : "s");
  return units.length ? units.join(":") : "none";
}

function stampField(stamp) {
  if (!stamp) return "";
  const remaining = stamp.remaining == null ? null : exactDuration(stamp.remaining);
  const wall = stamp.wallClock ? clockField(stamp.wallClock) : "";
  if (stamp.kind === "clock") {
    if (!wall) return "--:--:--.---";
    return remaining !== null ? `@ ${wall} ${remaining}` : `@ ${wall}`;
  }
  if (remaining === null) return "--:--:--.---";
  return wall ? `${remaining} @ ${wall}` : remaining;
}

function markdownText(note = record) {
  const remaining = note.phase === "idle" ? null : note === record ? currentRemaining() : note.remaining;
  const header = ["---", `timer: ${exactDuration(note.duration).replace(/\.\d{3}$/, "")}`];
  if (remaining != null) header.push(`remaining: ${exactDuration(remaining)}`);
  header.push(`detail: ${detailField(note.format)}`);
  if (note.mode !== "countdown") header.push(`stamps: ${note.mode}`);
  header.push("---", "");

  const body = [];
  note.lines.forEach((line) => {
    const parts = line.text.split("\n");
    if (!line.stamp) {
      body.push(trimTrailingSpaces(parts[0] || ""));
      body.push(...parts.slice(1).map((part) => `  ${trimTrailingSpaces(part)}`));
      return;
    }
    const prefix = `[${stampField(line.stamp)}]`;
    const indent = " ".repeat(prefix.length + 1);
    body.push(trimTrailingSpaces(`${prefix} ${parts[0] || ""}`));
    body.push(...parts.slice(1).map((part) => trimTrailingSpaces(`${indent}${part}`)));
  });
  return `${header.concat(body).join("\n")}\n`;
}

function trimTrailingSpaces(value) {
  return value.replace(/ +$/g, "");
}

function secondsFromField(value) {
  const match = value.trim().match(/^(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return null;
  return (match[1] ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]));
}

function parseDetail(value) {
  const units = value.toLowerCase().split(":");
  return {
    hours: units.includes("h"),
    minutes: units.includes("m"),
    seconds: units.some((unit) => unit.startsWith("s")),
    tenths: units.includes("s.1"),
  };
}

function parseStamp(raw) {
  const match = raw.match(/^\[([^\]]+)\]\s?(.*)$/);
  if (!match) return null;
  const field = match[1].trim();
  const text = match[2];
  if (field.startsWith("@")) {
    const rest = field.slice(1).trim();
    const parts = rest.split(/\s+/, 2);
    const wallClock = parts[0] && !Number.isNaN(new Date(parts[0]).valueOf()) ? new Date(parts[0]).toISOString() : null;
    if (!wallClock) return null;
    return { line: { text, stamp: { kind: "clock", wallClock, remaining: parts[1] ? secondsFromField(parts[1]) : null } }, prefixWidth: match[0].length - text.length };
  }
  const atIndex = field.indexOf("@");
  const remainingText = (atIndex < 0 ? field : field.slice(0, atIndex)).trim();
  const remaining = secondsFromField(remainingText);
  if (remaining == null) return null;
  const wallText = atIndex < 0 ? "" : field.slice(atIndex + 1).trim();
  const wallDate = wallText ? new Date(wallText) : null;
  return {
    line: { text, stamp: { kind: "countdown", remaining, wallClock: wallDate && !Number.isNaN(wallDate.valueOf()) ? wallDate.toISOString() : null } },
    prefixWidth: match[0].length - text.length,
  };
}

function parseMarkdown(text, title) {
  let body = text.replace(/\r\n?/g, "\n").split("\n");
  if (body.at(-1) === "") body.pop();
  let duration = 3600;
  let remaining = null;
  let format = { hours: true, minutes: true, seconds: true, tenths: false };
  let mode = "countdown";
  let hasAikariviFrontMatter = false;
  if (body[0]?.trim() === "---") {
    let end = 1;
    while (end < body.length && body[end].trim() !== "---") {
      const separator = body[end].indexOf(":");
      const key = separator < 0 ? body[end].trim() : body[end].slice(0, separator).trim();
      const value = separator < 0 ? "" : body[end].slice(separator + 1).trim();
      if (key === "timer") { duration = secondsFromField(value) ?? duration; hasAikariviFrontMatter = true; }
      if (key === "remaining") { remaining = secondsFromField(value); hasAikariviFrontMatter = true; }
      if (key === "detail") { format = parseDetail(value); hasAikariviFrontMatter = true; }
      if (key === "stamps") { mode = value.toLowerCase() === "clock" || value.toLowerCase() === "journal" ? "clock" : "countdown"; hasAikariviFrontMatter = true; }
      end += 1;
    }
    body = body.slice(Math.min(end + 1, body.length));
  }

  const lines = [];
  let previousPrefixWidth = 0;
  for (const raw of body) {
    const parsed = parseStamp(raw);
    if (parsed) {
      lines.push(parsed.line);
      previousPrefixWidth = parsed.prefixWidth;
      continue;
    }
    const indent = raw.match(/^ */)[0].length;
    if (indent >= 2 && lines.length) {
      const last = lines.at(-1);
      const fallbackIndent = hasAikariviFrontMatter ? 2 : 0;
      last.text += `\n${raw.slice(Math.min(indent, Math.max(previousPrefixWidth, fallbackIndent)))}`;
      continue;
    }
    if (!lines.length && raw.trim() === "") continue;
    lines.push({ text: raw, stamp: null });
    previousPrefixWidth = hasAikariviFrontMatter ? 2 : 0;
  }
  if (!lines.length) lines.push({ text: "", stamp: null });
  return { duration, remaining, format, mode, lines, title };
}

function downloadMarkdown() {
  const content = markdownText();
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeTitle = (record.title.trim() || record.dateKey || localDateKey())
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  anchor.href = url;
  anchor.download = `${safeTitle || "aikarivi-note"}.md`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importMarkdown(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const title = file.name.replace(/\.(md|markdown|txt)$/i, "");
    const parsed = parseMarkdown(String(reader.result || ""), title);
    let id = `import-${Date.now().toString(36)}`;
    while (notebook.notes[id]) id = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const note = makeNote(parsed);
    note.id = id;
    note.title = title;
    note.duration = parsed.duration;
    note.remaining = parsed.remaining ?? parsed.duration;
    note.phase = parsed.remaining == null ? "idle" : "paused";
    note.mode = parsed.mode;
    note.format = parsed.format;
    note.lines = parsed.lines;
    note.dateKey = localDateKey();
    notebook.notes[id] = note;
    notebook.activeId = id;
    record = note;
    deadline = null;
    resetHistory();
    if (!record.title.trim() && record.lines.some((line) => line.text.trim())) {
      assignTimeBasedTitle(record);
    }
    $("#task-title").value = record.title;
    updateNotePicker();
    updateModeAndFormat();
    updateTimerDisplay();
    renderEditor();
    saveNotebook();
  };
  reader.onerror = () => setSaveState("Could not read that file");
  reader.readAsText(file);
}

function init() {
  if (!storageAvailable) setSaveState("Storage unavailable — notes stay in this tab");
  const generatedTitle = !record.title.trim() && record.lines.some((line) => line.text.trim())
    ? assignTimeBasedTitle(record, dateForUntitledNote(record))
    : false;
  $("#task-title").value = record.title || "";
  updateNotePicker();
  if (generatedTitle) saveNotebook({ quiet: true });
  updateModeAndFormat();
  updateTimerDisplay();
  renderEditor();
  ensureTicker();

  editor.addEventListener("beforeinput", onBeforeInput);
  editor.addEventListener("paste", onPaste);
  editor.addEventListener("input", onInput);
  editor.addEventListener("keydown", onEditorKeyDown);
  editor.addEventListener("focusin", () => { history.groupKey = ""; });
  editor.addEventListener("focusout", () => { history.groupKey = ""; });

  $("#task-title").addEventListener("input", (event) => {
    record.title = event.target.value;
    record.titleAuto = false;
    saveNotebook({ quiet: true });
  });
  $("#edit-title-button").addEventListener("click", () => {
    const title = $("#task-title");
    title.focus();
    title.select();
  });
  $("#task-title").addEventListener("blur", updateNotePicker);
  $("#note-picker").addEventListener("change", (event) => switchNote(event.target.value));
  $("#new-note-button").addEventListener("click", startNewNote);
  $("#export-button").addEventListener("click", downloadMarkdown);
  $("#import-button").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (event) => {
    importMarkdown(event.target.files?.[0]);
    event.target.value = "";
  });
  $("#play-button").addEventListener("click", toggleTimer);
  $("#reset-button").addEventListener("click", resetTimer);
  $("#detail-trigger").addEventListener("click", () => {
    setDetailMenuOpen(!$("#detail-menu").classList.contains("is-open"));
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      record.mode = button.dataset.mode;
      updateModeAndFormat();
      saveNotebook();
    });
  });
  document.querySelectorAll("[data-unit]").forEach((button) => {
    button.addEventListener("click", () => {
      const unit = button.dataset.unit;
      if (unit === "tenths" && !record.format.seconds) return;
      const isLastTimeUnit = ["hours", "minutes", "seconds"].filter((key) => record.format[key]).length === 1;
      if (["hours", "minutes", "seconds"].includes(unit) && record.format[unit] && isLastTimeUnit) return;
      record.format[unit] = !record.format[unit];
      if (unit === "seconds" && !record.format.seconds) record.format.tenths = false;
      updateModeAndFormat();
      saveNotebook();
    });
  });

  document.querySelectorAll("[data-format]").forEach((button) => {
    button.addEventListener("click", () => {
      record.format = button.dataset.format === "exact"
        ? { hours: true, minutes: true, seconds: true, tenths: true }
        : { hours: false, minutes: true, seconds: false, tenths: false };
      updateModeAndFormat();
      saveNotebook();
      setDetailMenuOpen(false);
    });
  });

  document.querySelectorAll("[data-duration]").forEach((button) => {
    button.addEventListener("click", () => setDuration(Number(button.dataset.duration)));
  });
  $("#custom-duration-form").addEventListener("submit", (event) => {
    event.preventDefault();
    setDuration(Number($("#custom-minutes").value) * 60);
  });

  const dismissOpenMenusOutside = (event) => {
    const durationMenu = $("#duration-menu");
    if (durationMenu.open && !durationMenu.contains(event.target)) durationMenu.open = false;
    const detailMenu = $("#detail-menu");
    if (detailMenu.classList.contains("is-open") && !detailMenu.contains(event.target)) setDetailMenuOpen(false);
  };
  document.addEventListener("click", dismissOpenMenusOutside);
  document.addEventListener("pointerdown", dismissOpenMenusOutside);
  document.addEventListener("focusin", dismissOpenMenusOutside);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      $("#duration-menu").open = false;
      setDetailMenuOpen(false);
    }
  });

  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  window.addEventListener("beforeunload", () => {
    if (deadline !== null) {
      record.remaining = currentRemaining();
      record.phase = "paused";
      deadline = null;
      saveNotebook({ quiet: true });
    }
  });
}

init();
