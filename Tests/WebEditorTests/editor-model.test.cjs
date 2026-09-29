const { test } = require("node:test");
const assert = require("node:assert/strict");
const Text = require("../../web/src/editor/model.cjs");

const stamp = (remaining) => ({ kind: "countdown", remaining, wallClock: "2026-09-28T06:00:00.000Z" });
const line = (text = "", remaining = null) => ({ text, stamp: remaining === null ? null : stamp(remaining) });
const times = (lines) => lines.map((entry) => entry.stamp?.remaining ?? null);
const edit = (lines, from, to, insert, remaining = null, softBreak = false) =>
  Text.replace(lines, { from, to, insert, stamp: remaining === null ? null : stamp(remaining), softBreak });

test("Return leaves a blank paragraph; its first character takes the time", () => {
  let lines = [line("first", 3600)];
  lines = edit(lines, 5, 5, "\n", 3500);
  assert.deepEqual(times(lines), [3600, null]);
  lines = edit(lines, 6, 6, "second", 3200);
  assert.deepEqual(lines.map((entry) => entry.text), ["first", "second"]);
  assert.deepEqual(times(lines), [3600, 3200]);
});

test("text written before starting the timer stays plain when edited later", () => {
  let lines = edit([line()], 0, 0, "draft");
  lines = edit(lines, 0, 5, "DRAFT", 3500);
  lines = edit(lines, 5, 5, "\nnow", 3400);
  assert.deepEqual(times(lines), [null, 3400]);
  assert.equal(Text.text(lines), "DRAFT\nnow");
});

test("soft breaks stay in the paragraph and never add a timestamp", () => {
  let lines = edit([line("head", 3600)], 4, 4, "\n", 3500, true);
  lines = edit(lines, 5, 5, "tail", 3400);
  assert.deepEqual(lines, [line("head\ntail", 3600)]);
  lines = edit(lines, 9, 9, "\nnext", 3000);
  assert.deepEqual(lines, [line("head\ntail", 3600), line("next", 3000)]);
});

test("a soft break on an empty paragraph is not its first written character", () => {
  let lines = edit([line()], 0, 0, "\n", 3600, true);
  assert.deepEqual(lines, [line("\n")]);
  lines = edit(lines, 1, 1, "thought", 3400);
  assert.deepEqual(lines, [line("\nthought", 3400)]);
});

test("splitting a written paragraph stamps the new tail only", () => {
  const lines = edit([line("head and tail", 3600)], 4, 4, "\n", 1200);
  assert.deepEqual(lines, [line("head", 3600), line(" and tail", 1200)]);
});

test("paste stamps written paragraphs, leaving blank and trailing paragraphs unstamped", () => {
  const lines = edit([line()], 0, 0, "a\n\nb\n", 3580);
  assert.deepEqual(lines.map((entry) => entry.text), ["a", "", "b", ""]);
  assert.deepEqual(times(lines), [3580, null, 3580, null]);
});

test("deleting a hard break merges into the earlier paragraph and keeps its time", () => {
  const lines = edit([line("one", 3600), line("two", 2999)], 3, 4, "", 2000);
  assert.deepEqual(lines, [line("onetwo", 3600)]);
});

test("a selection can span paragraphs and soft breaks", () => {
  const lines = edit([line("one\nmore", 3600), line("two", 3500), line("three", 3400)], 2, 14, "X\nY", 600);
  assert.deepEqual(lines, [line("onX", 3600), line("Yhree", 600)]);
});

test("UTF-16 textarea offsets work with emoji and non-Latin text", () => {
  const lines = edit([line("🙂 привет", 3600), line("мир", 3000)], 3, 9, "hello", 2000);
  assert.equal(Text.text(lines), "🙂 hello\nмир");
  assert.deepEqual(times(lines), [3600, 3000]);
});

test("an edit keeps untouched paragraph objects for incremental rendering", () => {
  const before = [line("a", 3600), line("b", 3500), line("c", 3400)];
  const after = edit(before, 2, 3, "B", 2000);
  assert.equal(after[0], before[0]);
  assert.equal(after[2], before[2]);
  assert.deepEqual(before[1], line("b", 3500));
});

test("identical newlines are disambiguated using the actual insertion caret", () => {
  const change = Text.change("a\n\nb", "a\n\n\nb", { start: 2, end: 2, inputType: "insertLineBreak" });
  assert.deepEqual(change, { from: 2, to: 2, insert: "\n" });
});

test("replacing a selected soft break with Return creates a hard break even when the plain text is identical", () => {
  const before = [line("a\nb", 3600)];
  const change = Text.change("a\nb", "a\nb", { start: 1, end: 2, inputType: "insertLineBreak" });
  assert.deepEqual(change, { from: 1, to: 2, insert: "\n" });
  assert.deepEqual(Text.replace(before, { ...change, stamp: stamp(3000) }), [line("a", 3600), line("b", 3000)]);
});

test("Backspace uses its real location even among repeated line breaks", () => {
  const change = Text.change("a\n\n\nb", "a\n\nb", { start: 3, end: 3, inputType: "deleteContentBackward" });
  assert.deepEqual(change, { from: 2, to: 3, insert: "" });
});

test("selection replacement and browser corrections produce the exact text transaction", () => {
  assert.deepEqual(Text.change("one two", "one 🙂", { start: 4, end: 7, inputType: "insertFromPaste" }),
    { from: 4, to: 7, insert: "🙂" });
  const change = Text.change("teh", "the", { start: 3, end: 3, inputType: "insertReplacementText" });
  assert.equal("teh".slice(0, change.from) + change.insert + "teh".slice(change.to), "the");
});

const snapshot = (lines, start = Text.text(lines).length) => ({ noteId: "note", lines, start, end: start, scrollTop: 0 });

test("undo and redo restore text, timestamps and global caret together", () => {
  const history = new Text.History();
  const before = snapshot([line("first", 3600)], 5);
  const after = snapshot(edit(before.lines, 5, 5, "\nsecond", 3400));
  history.capture(before);
  assert.deepEqual(history.undo(after), before);
  assert.deepEqual(history.redo(before), after);
});

test("only contiguous typing is grouped; moving the caret starts another undo step", () => {
  const history = new Text.History();
  const blank = snapshot([line()], 0);
  const a = snapshot([line("a", 3600)], 1);
  const ab = snapshot([line("ab", 3600)], 2);
  history.capture(blank, { groupKey: "typing", at: 1000 });
  history.didEdit(a);
  history.capture(a, { groupKey: "typing", at: 1100 });
  history.didEdit(ab);
  const moved = snapshot(ab.lines, 0);
  history.capture(moved, { groupKey: "typing", at: 1200 });
  const changed = snapshot([line("Xab", 3600)], 1);
  assert.deepEqual(history.undo(changed), moved);
  assert.deepEqual(history.undo(moved), blank);
});

test("a new edit after undo discards redo and history owns its snapshots", () => {
  const history = new Text.History();
  const before = snapshot([line("a", 3600)]);
  history.capture(before);
  before.lines[0].text = "mutated";
  const restored = history.undo(snapshot([line("ab", 3600)]));
  assert.equal(restored.lines[0].text, "a");
  history.capture(restored);
  assert.equal(history.redo(snapshot([line("ax", 3600)])), null);
});
