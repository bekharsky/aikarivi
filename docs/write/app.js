const STORAGE_KEY = "aikarivi.web.v1";
const MAX_HISTORY = 120;
const $ = (selector) => document.querySelector(selector);
const editor = $("#note-editor");
const textInput = $("#note-input");
const editorViewport = $(".editor-scroll");
const rowNodes = new WeakMap();
const history = new AikariviText.History(MAX_HISTORY);
let pendingInput = null;
let composing = false;
let deadline = null;
let tickHandle = null;
let lastTimerPersistAt = 0;
let storageAvailable = true;
let notebookNeedsSave = false;
let saveMessageHandle = null;
let documentMenu = null;
let durationMenu = null;
let detailMenu = null;

function localDateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function makeNote({ id = localDateKey(), title = "", mode = "countdown", duration = 3600, lines, format } = {}) {
  const opened = new Date();
  const openedAt = opened.toISOString();
  const titleAuto = !String(title).trim();
  return {
    id,
    title: titleAuto ? timeBasedTitle(opened) : String(title),
    titleAuto,
    openedAt,
    dateKey: localDateKey(opened),
    mode,
    duration,
    remaining: duration,
    phase: "idle",
    format: format || { hours: true, minutes: true, seconds: true, tenths: false },
    lines: lines?.length ? lines : [{ text: "", stamp: null }],
    updatedAt: openedAt,
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
  notebookNeedsSave = true;
  return { activeId: note.id, notes: { [note.id]: note } };
}

const notebook = readNotebook();
const todayId = localDateKey();
if (!notebook.notes[todayId]) {
  notebook.notes[todayId] = makeNote();
  notebookNeedsSave = true;
}
if (!notebook.notes[notebook.activeId]) {
  notebook.activeId = todayId;
  notebookNeedsSave = true;
}

function activeNote() {
  return notebook.notes[notebook.activeId];
}

function normalizeNote(note) {
  const previousTitle = note.title;
  const previousTitleAuto = note.titleAuto;
  const previousOpenedAt = note.openedAt;
  note.title = String(note.title ?? "");
  note.titleAuto = !note.title.trim() || Boolean(note.titleAuto) || /^\d{1,2}:\d{2}$/.test(note.title.trim());
  note.duration = Math.max(1, Number(note.duration) || 3600);
  note.remaining = Number.isFinite(Number(note.remaining)) ? Number(note.remaining) : note.duration;
  if (!note.format || typeof note.format !== "object") note.format = { hours: true, minutes: true, seconds: true, tenths: false };
  if (!Array.isArray(note.lines) || !note.lines.length) note.lines = [{ text: "", stamp: null }];
  note.lines = note.lines.map((line) => ({ text: String(line.text ?? ""), stamp: line.stamp || null }));
  const firstStampedLine = note.lines.find((line) => line.text.trim() && line.stamp?.wallClock);
  const stampedDate = firstStampedLine ? new Date(firstStampedLine.stamp.wallClock) : null;
  const fallbackDate = new Date(note.updatedAt || `${note.dateKey || localDateKey()}T12:00:00`);
  const openedDate = note.openedAt ? new Date(note.openedAt) : null;
  note.openedAt = openedDate && !Number.isNaN(openedDate.valueOf()) ? openedDate.toISOString() :
    stampedDate && !Number.isNaN(stampedDate.valueOf()) ? stampedDate.toISOString() :
    !Number.isNaN(fallbackDate.valueOf()) ? fallbackDate.toISOString() : new Date().toISOString();
  if (note.titleAuto) {
    const date = new Date(note.openedAt);
    const legacyTime = note.title.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (legacyTime && !Number.isNaN(date.valueOf())) date.setHours(Number(legacyTime[1]), Number(legacyTime[2]), 0, 0);
    if (!Number.isNaN(date.valueOf())) note.title = timeBasedTitle(date);
  }
  if (note.title !== previousTitle || note.titleAuto !== previousTitleAuto || note.openedAt !== previousOpenedAt) {
    notebookNeedsSave = true;
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
    notebookNeedsSave = false;
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
  const customMinutes = $("#custom-minutes");
  if (document.activeElement !== customMinutes) customMinutes.value = Math.max(1, Math.round(record.duration / 60));
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
  setDurationMenuOpen(false);
}

function setDurationMenuOpen(open) {
  durationMenu.setOpen(open);
}

function formatDetailLabel() {
  const parts = [];
  if (record.format.hours) parts.push("h");
  if (record.format.minutes) parts.push("m");
  if (record.format.seconds) parts.push(record.format.tenths ? "s.1" : "s");
  return parts.join(":");
}

function setDetailMenuOpen(open) {
  detailMenu.setOpen(open);
}

function updateModeAndFormat() {
  document.querySelectorAll("[data-unit]").forEach((button) => {
    const unit = button.dataset.unit;
    const selected = Boolean(record.format[unit]);
    AikariviUI.setMenuItemSelected(button, selected);
    if (unit === "tenths") button.disabled = !record.format.seconds;
  });
  const detailLabel = formatDetailLabel();
  $("#detail-readout").textContent = detailLabel;
  $("#detail-trigger").setAttribute("aria-label", `Timestamp detail ${detailLabel}`);
  const clockMode = record.mode === "clock";
  $("#timer-controls").hidden = clockMode;
  $("#clock-display").hidden = !clockMode;
  if (clockMode) {
    setDurationMenuOpen(false);
  }
  updateTimerDisplay();
  updateAllStamps();
  ensureTicker();
}

function makeLineRow(line) {
  const row = document.createElement("div");
  row.className = "note-row";
  const label = document.createElement("span");
  label.className = "line-stamp";
  const text = document.createElement("div");
  text.className = "line-text";
  // Keep an empty final visual line measurable. This character is only in the
  // presentation layer: it never enters the input, notebook, copy or export.
  text.textContent = line.text + (!line.text || line.text.endsWith("\n") ? "\u200b" : "");
  row.append(label, text);
  rowNodes.set(line, row);
  return row;
}

function paintStamp(row, line, index) {
  const label = row.firstElementChild;
  const stamp = line.stamp;
  const value = formatStamp(stamp);
  label.textContent = value;
  label.classList.toggle("is-clock", stamp?.kind === "clock");
  label.classList.toggle("is-overtime", stamp?.kind === "countdown" && Number(stamp.remaining) < 0);
  label.title = value && stamp.wallClock ? `Line started at ${new Date(stamp.wallClock).toLocaleTimeString()}` : "";
  row.dataset.index = String(index);
}

function renderRows() {
  // Only the changed paragraphs get new nodes. The one native text input is
  // never removed, resized to its contents or refocused when a line is created.
  let next = editor.firstElementChild;
  record.lines.forEach((line, index) => {
    const row = rowNodes.get(line) || makeLineRow(line);
    if (row === next) next = next.nextElementSibling;
    else editor.insertBefore(row, next);
    paintStamp(row, line, index);
  });
  while (next) {
    const old = next;
    next = next.nextElementSibling;
    old.remove();
  }
  syncEditorGeometry();
  syncEditorScroll();
}

function renderEditor({ focus = false, selectionStart, selectionEnd, direction = "none", scrollTop = 0 } = {}) {
  if (!record.lines.length) record.lines = [{ text: "", stamp: null }];
  textInput.value = AikariviText.text(record.lines);
  pendingInput = null;
  renderRows();
  updateTimestampLayout();
  updateLineCount();
  const start = Math.min(selectionStart ?? textInput.value.length, textInput.value.length);
  const end = Math.min(selectionEnd ?? start, textInput.value.length);
  textInput.setSelectionRange(start, end, direction);
  if (focus) textInput.focus({ preventScroll: true });
  textInput.scrollTop = scrollTop;
  syncEditorScroll();
}

function updateTimestampLayout() {
  const label = editor.querySelector(".line-stamp");
  if (!label) return;
  const style = getComputedStyle(label);
  const context = document.createElement("canvas").getContext("2d");
  // Reserve the full column even with no stamps or a shorter display format.
  // Clock/countdown, Enter and the first timed character cannot move the text.
  const exact = { hours: true, minutes: true, seconds: true, tenths: true };
  const largest = record.lines.reduce((value, line) => Math.max(value, Math.abs(line.stamp?.remaining || 0)), Math.max(86400, record.duration));
  const sample = formatDuration(-largest, exact);
  if (context) context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const width = Math.ceil(context ? context.measureText(sample).width : sample.length * 7);
  editorViewport.style.setProperty("--stamp-width", `${width}px`);
  syncEditorGeometry();
}

function syncEditorGeometry() {
  // The native scrollbar has its own reserved space. Match the actual text
  // width, so a wrapped line occupies exactly the same rows in both layers.
  editor.style.width = `calc(var(--text-inset) + ${textInput.clientWidth}px)`;
}

function syncEditorScroll() {
  editor.style.transform = `translateY(${-textInput.scrollTop}px)`;
}

function updateAllStamps() {
  [...editor.children].forEach((row, index) => {
    if (record.lines[index]) paintStamp(row, record.lines[index], index);
  });
  updateTimestampLayout();
}

function updateLineCount() {
  const count = record.lines.filter((line) => line.text.trim().length > 0).length;
  $("#line-count").textContent = `${count} ${count === 1 ? "line" : "lines"}`;
}

function syncTitleWidth() {
  const title = $("#task-title");
  $("#title-sizing").textContent = title.value || title.placeholder;
}

function updateNotePicker() {
  syncTitleWidth();
  const notes = Object.values(notebook.notes).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const options = notes.map((note) => {
    const date = note.dateKey ? new Date(`${note.dateKey}T12:00:00`) : new Date(note.updatedAt);
    const dateLabel = Number.isNaN(date.valueOf()) ? "Saved note" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
    const fallback = `${note.id === localDateKey() ? "Today" : "Note"} · ${dateLabel}`;
    const label = note.title.trim()
      ? (note.titleAuto ? note.title.trim() : `${note.title.trim()} · ${dateLabel}`)
      : fallback;
    return { value: note.id, label };
  });
  documentMenu.setOptions(options, notebook.activeId);
}

function resetHistory() {
  history.reset();
  pendingInput = null;
}

function inputSelection() {
  return {
    start: textInput.selectionStart,
    end: textInput.selectionEnd,
    direction: textInput.selectionDirection,
    scrollTop: textInput.scrollTop,
  };
}

function cursorSnapshot(selection = inputSelection()) {
  return { noteId: notebook.activeId, lines: record.lines, ...selection };
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot || snapshot.noteId !== notebook.activeId) return;
  record.lines = AikariviText.copyLines(snapshot.lines);
  renderEditor({
    focus: true,
    selectionStart: snapshot.start,
    selectionEnd: snapshot.end,
    direction: snapshot.direction,
    scrollTop: snapshot.scrollTop,
  });
  saveNotebook({ quiet: true });
}

function undo() {
  applyHistorySnapshot(history.undo(cursorSnapshot()));
}

function redo() {
  applyHistorySnapshot(history.redo(cursorSnapshot()));
}

function pauseForDocumentChange() {
  if (deadline !== null) {
    record.remaining = currentRemaining();
    record.phase = "paused";
    deadline = null;
  }
  setDurationMenuOpen(false);
  setDetailMenuOpen(false);
  documentMenu.close();
}

function switchNote(id) {
  if (!notebook.notes[id] || id === notebook.activeId) return;
  pauseForDocumentChange();
  notebook.activeId = id;
  record = normalizeNote(activeNote());
  deadline = null;
  resetHistory();
  $("#task-title").value = record.title;
  updateNotePicker();
  updateModeAndFormat();
  renderEditor();
  updateTimerDisplay();
  saveNotebook({ quiet: true });
}

function startNewNote() {
  pauseForDocumentChange();
  const dateKey = localDateKey();
  let id = `note-${Date.now().toString(36)}`;
  while (notebook.notes[id]) id = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const note = makeNote({ id, mode: record.mode, duration: record.duration, format: { ...record.format } });
  note.dateKey = dateKey;
  notebook.notes[id] = note;
  notebook.activeId = id;
  record = note;
  deadline = null;
  resetHistory();
  $("#task-title").value = record.title;
  updateNotePicker();
  updateModeAndFormat();
  renderEditor({ focus: true, selectionStart: 0, selectionEnd: 0 });
  updateTimerDisplay();
  saveNotebook();
}

function commitTextEdit(change, before, { softBreak = false, groupKey = "", stamp = makeStamp() } = {}) {
  history.capture(cursorSnapshot(before), { groupKey });
  record.lines = AikariviText.replace(record.lines, { ...change, softBreak, stamp });
  if (!record.title.trim() && record.lines.some((line) => line.text.trim())) {
    assignTimeBasedTitle(record, dateForUntitledNote(record));
  }
  renderRows();
  updateLineCount();
  history.didEdit(cursorSnapshot());
  saveNotebook({ quiet: true });
}

function beforeTextInput(event) {
  if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
    event.preventDefault();
    pendingInput = null;
    if (event.inputType === "historyUndo") undo();
    else redo();
    return;
  }
  pendingInput = { text: textInput.value, ...inputSelection(), inputType: event.inputType, stamp: makeStamp() };
}

function onTextInput(event) {
  const beforeText = AikariviText.text(record.lines);
  const before = pendingInput?.text === beforeText ? pendingInput : null;
  const change = AikariviText.change(beforeText, textInput.value, before || {});
  pendingInput = null;
  if (!change) return;
  const inputType = event.inputType || before?.inputType || "";
  const groupable = ["insertText", "deleteContentBackward", "deleteContentForward"].includes(inputType)
    && !change.insert.includes("\n") && !beforeText.slice(change.from, change.to).includes("\n");
  const groupKey = composing || event.isComposing ? `${notebook.activeId}:composition`
    : groupable ? `${notebook.activeId}:${inputType}` : "";
  commitTextEdit(change, before || { ...inputSelection(), start: change.from, end: change.to }, {
    groupKey, stamp: before ? before.stamp : makeStamp(),
  });
  revealCaret();
}

function insertSoftLineBreak() {
  const before = inputSelection();
  const change = { from: before.start, to: before.end, insert: "\n" };
  textInput.setRangeText(change.insert, before.start, before.end, "end");
  commitTextEdit(change, before, { softBreak: true });
  pendingInput = null;
  revealCaret();
}

function revealCaret() {
  const caretOffset = textInput.selectionDirection === "backward" ? textInput.selectionStart : textInput.selectionEnd;
  const position = AikariviText.locate(record.lines, caretOffset);
  const row = rowNodes.get(record.lines[position.index]);
  const node = row?.querySelector(".line-text")?.firstChild;
  if (!node) return;
  const range = document.createRange();
  range.setStart(node, Math.min(caretOffset - position.start, node.length));
  range.collapse(true);
  const caret = range.getBoundingClientRect();
  const viewport = editorViewport.getBoundingClientRect();
  if (!caret.height) return;
  if (caret.top < viewport.top) textInput.scrollTop -= viewport.top - caret.top;
  else if (caret.bottom > viewport.bottom) textInput.scrollTop += caret.bottom - viewport.bottom;
  syncEditorScroll();
}

function editorKeyDown(event) {
  if (event.isComposing || composing) return;
  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (command && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  } else if (event.key === "Enter" && (command || event.shiftKey || event.altKey)) {
    event.preventDefault();
    insertSoftLineBreak();
  } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
    history.breakGroup();
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
    const note = makeNote({ ...parsed, id, title });
    note.duration = parsed.duration;
    note.remaining = parsed.remaining ?? parsed.duration;
    note.phase = parsed.remaining == null ? "idle" : "paused";
    note.mode = parsed.mode;
    note.format = parsed.format;
    note.lines = parsed.lines;
    note.dateKey = localDateKey();
    pauseForDocumentChange();
    notebook.notes[id] = note;
    notebook.activeId = id;
    record = note;
    deadline = null;
    resetHistory();
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
  documentMenu = new AikariviUI.SelectMenu({
    root: $("#document-menu"), trigger: $("#note-picker"), panel: $("#document-popover"),
    list: $("#document-options"), onChange: switchNote,
  });
  durationMenu = new AikariviUI.Popover({
    root: $("#duration-menu"), trigger: $("#timer-trigger"), panel: $("#duration-popover"),
  });
  detailMenu = new AikariviUI.Popover({
    root: $("#detail-menu"), trigger: $("#detail-trigger"), panel: $("#detail-popover"),
  });
  const timestampUnits = [
    { unit: "hours", label: "Hours", accessibleLabel: "Show hours" },
    { unit: "minutes", label: "Minutes", accessibleLabel: "Show minutes" },
    { unit: "seconds", label: "Seconds", accessibleLabel: "Show seconds" },
    { unit: "tenths", label: "Tenths", accessibleLabel: "Show tenths of a second" },
  ];
  $("#timestamp-unit-list").replaceChildren(...timestampUnits.map(({ unit, label, accessibleLabel }) => {
    const selected = Boolean(record.format[unit]);
    const item = AikariviUI.createMenuItem({
      label, role: "menuitemcheckbox", selected,
      leading: AikariviUI.createCheckIndicator(selected),
    });
    item.dataset.unit = unit;
    item.setAttribute("aria-label", accessibleLabel);
    return item;
  }));
  if (!storageAvailable) setSaveState("Storage unavailable — notes stay in this tab");
  $("#task-title").value = record.title;
  updateNotePicker();
  if (notebookNeedsSave) saveNotebook({ quiet: true });
  updateModeAndFormat();
  updateTimerDisplay();
  renderEditor();
  ensureTicker();

  textInput.addEventListener("beforeinput", beforeTextInput);
  textInput.addEventListener("input", onTextInput);
  textInput.addEventListener("keydown", editorKeyDown);
  textInput.addEventListener("scroll", syncEditorScroll);
  textInput.addEventListener("pointerdown", () => history.breakGroup());
  textInput.addEventListener("blur", () => history.breakGroup());
  textInput.addEventListener("paste", () => history.breakGroup());
  textInput.addEventListener("compositionstart", () => {
    composing = true;
    history.breakGroup();
  });
  textInput.addEventListener("compositionend", () => {
    composing = false;
    history.breakGroup();
  });
  editorViewport.addEventListener("pointerdown", (event) => {
    if (event.target === textInput) return;
    const row = event.target.closest(".note-row");
    let start = 0;
    if (row) {
      const index = Number(row.dataset.index);
      start = record.lines.slice(0, index).reduce((total, line) => total + line.text.length + 1, 0);
    }
    event.preventDefault();
    textInput.focus({ preventScroll: true });
    textInput.setSelectionRange(start, start);
    history.breakGroup();
  });
  const editorResize = new ResizeObserver(() => {
    updateTimestampLayout();
    syncEditorScroll();
  });
  editorResize.observe(editorViewport);
  window.addEventListener("resize", updateTimestampLayout);

  $("#task-title").addEventListener("input", (event) => {
    record.title = event.target.value;
    record.titleAuto = false;
    syncTitleWidth();
    saveNotebook({ quiet: true });
  });
  $("#edit-title-button").addEventListener("click", () => {
    const title = $("#task-title");
    title.focus();
    title.select();
  });
  $("#task-title").addEventListener("blur", () => {
    if (assignTimeBasedTitle(record, dateForUntitledNote(record))) saveNotebook({ quiet: true });
    updateNotePicker();
  });
  $("#new-note-button").addEventListener("click", startNewNote);
  $("#export-button").addEventListener("click", downloadMarkdown);
  $("#import-button").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (event) => {
    importMarkdown(event.target.files?.[0]);
    event.target.value = "";
  });
  $("#play-button").addEventListener("click", toggleTimer);
  $("#reset-button").addEventListener("click", resetTimer);

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
