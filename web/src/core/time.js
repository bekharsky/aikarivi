export const DEFAULT_FORMAT = Object.freeze({
  hours: true,
  minutes: true,
  seconds: true,
  tenths: false,
});

export function formatDuration(value, format = DEFAULT_FORMAT) {
  if (![format.hours, format.minutes, format.seconds].some(Boolean)) return "";
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

export function formatClock(date, format = DEFAULT_FORMAT) {
  if (![format.hours, format.minutes, format.seconds].some(Boolean)) return "";
  const parts = [];
  if (format.hours) parts.push(String(date.getHours()).padStart(2, "0"));
  if (format.minutes) parts.push(String(date.getMinutes()).padStart(2, "0"));
  if (format.seconds) parts.push(String(date.getSeconds()).padStart(2, "0"));
  let result = parts.join(":");
  if (format.tenths && format.seconds) result += `.${Math.floor(date.getMilliseconds() / 100)}`;
  return result;
}

export function formatStamp(stamp, format, now = new Date()) {
  if (!stamp) return "";
  if (stamp.kind === "clock") {
    const date = stamp.wallClock ? new Date(stamp.wallClock) : null;
    return date && !Number.isNaN(date.valueOf()) ? formatClock(date, format) : "";
  }
  return stamp.remaining == null ? "" : formatDuration(Number(stamp.remaining), format);
}

export function formatDetailLabel(format) {
  const parts = [];
  if (format.hours) parts.push("h");
  if (format.minutes) parts.push("m");
  if (format.seconds) parts.push(format.tenths ? "s.1" : "s");
  return parts.join(":");
}

export function localDateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function timeBasedTitle(date = new Date()) {
  const datePart = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "short", day: "numeric", year: "numeric",
  }).format(date);
  return `${datePart} · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
