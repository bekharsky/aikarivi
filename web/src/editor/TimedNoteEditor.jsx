import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Text from "./model.cjs";
import { formatStamp } from "../core/time.js";
import { Separator, Surface } from "../components/ui/Surface.jsx";

function LineRow({ line, index, format }) {
  const value = formatStamp(line.stamp, format);
  return (
    <div className="note-row" data-index={index}>
      <span className={`line-stamp${line.stamp?.kind === "clock" ? " is-clock" : ""}${line.stamp?.kind === "countdown" && line.stamp.remaining < 0 ? " is-overtime" : ""}`}>
        {value}
      </span>
      <div className="line-text">{line.text}{!line.text || line.text.endsWith("\n") ? "\u200b" : null}</div>
    </div>
  );
}

function positionFromTarget(textarea, lines, target) {
  const row = target.closest(".note-row");
  if (!row) return 0;
  const index = Number(row.dataset.index);
  return lines.slice(0, index).reduce((total, line) => total + line.text.length + 1, 0);
}

export function TimedNoteEditor({ note, stamp, saveState = "Saved on this device", onLinesChange }) {
  const textarea = useRef(null);
  const pending = useRef(null);
  const composing = useRef(false);
  const history = useRef(new Text.History());
  const restore = useRef(null);
  const noteRef = useRef(note);
  const linesRef = useRef(note.lines);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  noteRef.current = note;
  linesRef.current = note.lines;

  useLayoutEffect(() => {
    history.current.reset();
    pending.current = null;
    restore.current = { start: note.lines.map((line) => line.text).join("\n").length, end: note.lines.map((line) => line.text).join("\n").length };
  }, [note.id]);

  useLayoutEffect(() => {
    const input = textarea.current;
    if (!input) return undefined;
    const measure = () => setScrollbarWidth(Math.max(0, input.offsetWidth - input.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(input);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!restore.current || !textarea.current) return;
    textarea.current.setSelectionRange(restore.current.start, restore.current.end, restore.current.direction || "none");
    textarea.current.scrollTop = restore.current.scrollTop ?? textarea.current.scrollTop;
    restore.current = null;
  }, [note.id, note.lines]);

  const currentText = note.lines.map((line) => line.text).join("\n");

  const selection = useCallback(() => ({
    start: textarea.current?.selectionStart ?? 0,
    end: textarea.current?.selectionEnd ?? 0,
    direction: textarea.current?.selectionDirection ?? "none",
    scrollTop: textarea.current?.scrollTop ?? 0,
  }), []);

  const snapshot = useCallback((lines = linesRef.current, selected = selection()) => ({
    noteId: noteRef.current.id,
    lines,
    ...selected,
  }), [selection]);

  const commit = useCallback((change, before, { softBreak = false, groupKey = "", lineStamp = stamp() } = {}) => {
    history.current.capture(snapshot(linesRef.current, before), { groupKey });
    const nextLines = Text.replace(linesRef.current, { ...change, softBreak, stamp: lineStamp });
    linesRef.current = nextLines;
    onLinesChange(nextLines);
    history.current.didEdit(snapshot(nextLines, selection()));
  }, [onLinesChange, selection, snapshot, stamp]);

  const applyHistory = useCallback((direction) => {
    const current = snapshot();
    const previous = direction === "undo" ? history.current.undo(current) : history.current.redo(current);
    if (!previous) return;
    pending.current = null;
    linesRef.current = Text.copyLines(previous.lines);
    restore.current = previous;
    onLinesChange(linesRef.current);
  }, [onLinesChange, snapshot]);

  function handleBeforeInput(event) {
    const inputType = event.nativeEvent.inputType || event.inputType || "";
    if (inputType === "historyUndo" || inputType === "historyRedo") {
      event.preventDefault();
      applyHistory(inputType === "historyUndo" ? "undo" : "redo");
      return;
    }
    pending.current = { text: currentText, ...selection(), inputType, stamp: stamp() };
  }

  function handleChange(event) {
    const input = event.target;
    const previousText = Text.text(linesRef.current);
    const before = pending.current?.text === previousText ? pending.current : null;
    const change = Text.change(previousText, input.value, before || {});
    pending.current = null;
    if (!change) return;
    const inputType = event.nativeEvent.inputType || before?.inputType || "";
    const groupable = ["insertText", "deleteContentBackward", "deleteContentForward"].includes(inputType)
      && !change.insert.includes("\n") && !previousText.slice(change.from, change.to).includes("\n");
    const groupKey = composing.current || event.nativeEvent.isComposing
      ? `${note.id}:composition`
      : groupable ? `${note.id}:${inputType}` : "";
    commit(change, before || { ...selection(), start: change.from, end: change.to }, {
      groupKey,
      lineStamp: before?.stamp || stamp(),
    });
  }

  function insertSoftBreak() {
    const before = selection();
    const change = { from: before.start, to: before.end, insert: "\n" };
    textarea.current.setRangeText("\n", before.start, before.end, "end");
    commit(change, before, { softBreak: true });
    pending.current = null;
  }

  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing || composing.current) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      applyHistory(event.shiftKey ? "redo" : "undo");
    } else if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();
      applyHistory("redo");
    } else if (event.key === "Enter" && (command || event.shiftKey || event.altKey)) {
      event.preventDefault();
      insertSoftBreak();
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      history.current.breakGroup();
    }
  }

  function handlePointerDown(event) {
    if (event.target === textarea.current) return;
    const start = positionFromTarget(textarea.current, linesRef.current, event.target);
    event.preventDefault();
    textarea.current.focus({ preventScroll: true });
    textarea.current.setSelectionRange(start, start);
    history.current.breakGroup();
  }

  const count = note.lines.filter((line) => line.text.trim()).length;

  return (
    <Surface className="note-card" aria-label="Your local note">
      <div className="editor-scroll" onPointerDown={handlePointerDown}>
        <div
          className="note-editor"
          aria-hidden="true"
          style={{ right: scrollbarWidth, transform: `translateY(${-scrollTop}px)` }}
        >
          {note.lines.map((line, index) => <LineRow key={index} line={line} index={index} format={note.format} />)}
        </div>
        <Separator orientation="vertical" className="timestamp-divider" />
        <textarea
          ref={textarea}
          className="note-input"
          aria-label="Note text"
          placeholder="Start writing here…"
          spellCheck
          autoCapitalize="sentences"
          autoComplete="off"
          wrap="soft"
          value={currentText}
          onBeforeInput={handleBeforeInput}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          onCompositionStart={() => { composing.current = true; history.current.breakGroup(); }}
          onCompositionEnd={() => { composing.current = false; history.current.breakGroup(); }}
          onBlur={() => history.current.breakGroup()}
          onPaste={() => history.current.breakGroup()}
        />
      </div>
      <footer className="note-footer">
        <span>{count} {count === 1 ? "line" : "lines"}</span>
        <span className="save-state">
          <span className="local-indicator" aria-hidden="true" />
          <span>{saveState}</span>
        </span>
      </footer>
    </Surface>
  );
}
