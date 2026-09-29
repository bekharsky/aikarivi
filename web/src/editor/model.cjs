// Textarea offsets are UTF-16 offsets, just like JS string slices. Hard breaks
// separate stamped paragraphs; soft breaks are newlines inside a paragraph.
// This model never knows about DOM rows, fonts, wrapping or scrolling.
const AikariviText = (() => {
  const text = (lines) => lines.map((line) => line.text).join("\n");
  const copyLines = (lines) => lines.map((line) => ({
    text: line.text,
    stamp: line.stamp ? { ...line.stamp } : null,
  }));

  function locate(lines, offset) {
    let start = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const end = start + lines[index].text.length;
      if (offset <= end || index === lines.length - 1) return { index, start, end };
      start = end + 1;
    }
    return { index: 0, start: 0, end: 0 };
  }

  // Apply one replacement to the paragraphs it actually touches. Untouched
  // paragraphs keep their objects, so the renderer can keep their DOM too.
  function replace(lines, { from, to = from, insert = "", stamp = null, softBreak = false }) {
    if (!lines.length) lines = [{ text: "", stamp: null }];
    const length = text(lines).length;
    from = Math.max(0, Math.min(from, length));
    to = Math.max(from, Math.min(to, length));
    const first = locate(lines, from);
    const last = locate(lines, to);
    const original = lines[first.index];
    const head = original.text.slice(0, from - first.start);
    const tail = lines[last.index].text.slice(to - last.start);
    const parts = softBreak ? [insert] : insert.split("\n");
    const wasEmpty = !original.text.replace(/\n/g, "").length;
    const replacement = parts.map((part, index) => {
      const value = (index === 0 ? head : "") + part + (index === parts.length - 1 ? tail : "");
      const time = index === 0
        ? original.stamp || (wasEmpty && part.replace(/\n/g, "").length ? stamp : null)
        : value.length ? stamp : null;
      return { text: value, stamp: time ? { ...time } : null };
    });
    return [
      ...lines.slice(0, first.index),
      ...replacement,
      ...lines.slice(last.index + 1),
    ];
  }

  // Prefer the browser's beforeinput selection over a plain string diff. In
  // "a\n\n\nb", a diff alone cannot tell which empty paragraph was deleted.
  function change(before, after, { start = 0, end = start, inputType = "" } = {}) {
    // Replacing a selected soft break with Return changes paragraph metadata
    // even though the textarea still contains the same plain newline.
    if (before === after && !(start < end && inputType.startsWith("insert"))) return null;
    const candidate = (from, to) => {
      const insertedLength = after.length - before.length + to - from;
      if (from < 0 || to > before.length || insertedLength < 0) return null;
      const insert = after.slice(from, from + insertedLength);
      return before.slice(0, from) + insert + before.slice(to) === after ? { from, to, insert } : null;
    };
    let edit = candidate(start, end);
    if (edit) return edit;
    if (start === end && inputType.startsWith("delete")) {
      const removedLength = before.length - after.length;
      edit = inputType.endsWith("Backward")
        ? candidate(start - removedLength, start)
        : candidate(start, start + removedLength);
      if (edit) return edit;
    }

    // IME, autocorrect and input methods without beforeinput can replace a
    // larger range than the selection. Map only the changed middle in that case.
    let from = 0;
    while (from < before.length && from < after.length && before[from] === after[from]) from += 1;
    let to = before.length;
    let insertedEnd = after.length;
    while (to > from && insertedEnd > from && before[to - 1] === after[insertedEnd - 1]) {
      to -= 1;
      insertedEnd -= 1;
    }
    return { from, to, insert: after.slice(from, insertedEnd) };
  }

  const cloneSnapshot = (snapshot) => ({ ...snapshot, lines: copyLines(snapshot.lines) });

  class History {
    constructor(limit = 120) {
      this.limit = limit;
      this.reset();
    }

    reset() {
      this.undoStack = [];
      this.redoStack = [];
      this.breakGroup();
    }

    breakGroup() {
      this.groupKey = "";
      this.groupAt = 0;
      this.expectedSelection = null;
    }

    capture(snapshot, { groupKey = "", at = Date.now() } = {}) {
      const previous = this.expectedSelection;
      const contiguous = previous && previous.noteId === snapshot.noteId
        && previous.start === snapshot.start && previous.end === snapshot.end;
      if (!(groupKey && groupKey === this.groupKey && contiguous && at - this.groupAt < 850)) {
        this.undoStack.push(cloneSnapshot(snapshot));
        if (this.undoStack.length > this.limit) this.undoStack.shift();
      }
      this.redoStack = [];
      this.groupKey = groupKey;
      this.groupAt = at;
    }

    didEdit({ noteId, start, end }) {
      this.expectedSelection = { noteId, start, end };
    }

    undo(current) {
      const previous = this.undoStack.at(-1);
      if (!previous || previous.noteId !== current.noteId) return null;
      this.undoStack.pop();
      this.redoStack.push(cloneSnapshot(current));
      this.breakGroup();
      return previous;
    }

    redo(current) {
      const next = this.redoStack.at(-1);
      if (!next || next.noteId !== current.noteId) return null;
      this.redoStack.pop();
      this.undoStack.push(cloneSnapshot(current));
      this.breakGroup();
      return next;
    }
  }

  return { text, copyLines, locate, replace, change, History };
})();

// A classic script also works from file://; no runtime dependency or CDN.
if (typeof module !== "undefined") module.exports = AikariviText;
