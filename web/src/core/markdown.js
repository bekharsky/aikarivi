import { DEFAULT_FORMAT, formatDuration, localDateKey } from "./time.js";

function exactDuration(value) {
  const totalMs = Math.round(Math.abs(Number(value)) * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor(totalMs / 60000) % 60;
  const seconds = (totalMs % 60000) / 1000;
  return `${Number(value) < 0 ? "-" : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function clockField(value) {
  const date = new Date(value);
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

const trimTrailingSpaces = (value) => value.replace(/ +$/g, "");

export function exportMarkdown(note, remaining = note.remaining) {
  const currentRemaining = note.phase === "idle" ? null : remaining;
  const header = ["---", `timer: ${exactDuration(note.duration).replace(/\.\d{3}$/, "")}`];
  if (currentRemaining != null) header.push(`remaining: ${exactDuration(currentRemaining)}`);
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

export function secondsFromField(value) {
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
    const wallDate = parts[0] ? new Date(parts[0]) : null;
    const wallClock = wallDate && !Number.isNaN(wallDate.valueOf()) ? wallDate.toISOString() : null;
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

export function importMarkdown(text, title = "") {
  let body = text.replace(/\r\n?/g, "\n").split("\n");
  if (body.at(-1) === "") body.pop();
  let duration = 3600;
  let remaining = null;
  let format = { ...DEFAULT_FORMAT };
  let mode = "countdown";
  let hasFrontMatter = false;
  if (body[0]?.trim() === "---") {
    let end = 1;
    while (end < body.length && body[end].trim() !== "---") {
      const separator = body[end].indexOf(":");
      const key = separator < 0 ? body[end].trim() : body[end].slice(0, separator).trim();
      const value = separator < 0 ? "" : body[end].slice(separator + 1).trim();
      if (key === "timer") { duration = secondsFromField(value) ?? duration; hasFrontMatter = true; }
      if (key === "remaining") { remaining = secondsFromField(value); hasFrontMatter = true; }
      if (key === "detail") { format = parseDetail(value); hasFrontMatter = true; }
      if (key === "stamps") { mode = ["clock", "journal"].includes(value.toLowerCase()) ? "clock" : "countdown"; hasFrontMatter = true; }
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
      const fallbackIndent = hasFrontMatter ? 2 : 0;
      last.text += `\n${raw.slice(Math.min(indent, Math.max(previousPrefixWidth, fallbackIndent)))}`;
      continue;
    }
    if (!lines.length && raw.trim() === "") continue;
    lines.push({ text: raw, stamp: null });
    previousPrefixWidth = hasFrontMatter ? 2 : 0;
  }
  if (!lines.length) lines.push({ text: "", stamp: null });
  return { duration, remaining, format, mode, lines, title };
}

export function markdownFileName(note, now = new Date()) {
  return (note.title.trim() || note.dateKey || localDateKey(now))
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "aikarivi-note";
}
