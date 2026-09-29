export function remainingAt(note, now, deadline) {
  if (note.phase === "running" || note.phase === "overtime") {
    return deadline == null ? note.remaining : (deadline - now) / 1000;
  }
  return note.phase === "paused" ? note.remaining : note.duration;
}

export function makeStamp(note, remaining, date = new Date()) {
  const wallClock = date.toISOString();
  if (note.mode === "clock") {
    return { kind: "clock", wallClock, remaining: note.phase === "idle" ? null : remaining };
  }
  if (note.phase !== "running" && note.phase !== "overtime") return null;
  return { kind: "countdown", wallClock, remaining };
}

export function changeDuration(note, seconds, currentRemaining, deadline, now) {
  const duration = Math.max(1, Math.round(seconds));
  const delta = duration - note.duration;
  let remaining;
  let phase = note.phase;
  let nextDeadline = deadline;
  if (phase === "idle") remaining = duration;
  else if (phase === "paused") remaining = note.remaining + delta;
  else {
    nextDeadline = deadline == null ? now + currentRemaining * 1000 : deadline + delta * 1000;
    remaining = (nextDeadline - now) / 1000;
    phase = remaining <= 0 ? "overtime" : "running";
  }
  return { duration, remaining, phase, deadline: nextDeadline };
}
