import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatClock, formatDuration } from "../core/time.js";
import { changeDuration, makeStamp, remainingAt } from "./time.js";

export function useTimer(note, updateNote) {
  const latest = useRef(note);
  const deadline = useRef(null);
  const lastSaved = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  latest.current = note;

  useEffect(() => {
    deadline.current = null;
  }, [note.id]);

  useEffect(() => {
    lastSaved.current = Date.now();
    const resolution = note.format.tenths && note.format.seconds ? 100 : note.mode === "clock" ? 1000 : 250;
    const tick = () => {
      const timestamp = Date.now();
      setNow(timestamp);
      const current = latest.current;
      if (current.phase !== "running" && current.phase !== "overtime") return;
      const remaining = remainingAt(current, timestamp, deadline.current);
      const phase = remaining <= 0 ? "overtime" : "running";
      if (phase !== current.phase || timestamp - lastSaved.current >= 1000) {
        lastSaved.current = timestamp;
        updateNote(current.id, { remaining, phase });
      }
    };
    const handle = window.setInterval(tick, resolution);
    return () => window.clearInterval(handle);
  }, [note.id, note.mode, note.phase, note.format.tenths, note.format.seconds, updateNote]);

  const remaining = useMemo(() => remainingAt(note, now, deadline.current), [note, now]);
  const readout = note.mode === "clock"
    ? formatClock(new Date(now), note.format)
    : formatDuration(remaining, note.format);

  const toggle = useCallback(() => {
    const current = latest.current;
    const timestamp = Date.now();
    if (current.phase === "running" || current.phase === "overtime") {
      const value = remainingAt(current, timestamp, deadline.current);
      deadline.current = null;
      updateNote(current.id, { phase: "paused", remaining: value });
    } else {
      const value = current.phase === "paused" ? current.remaining : current.duration;
      deadline.current = timestamp + value * 1000;
      updateNote(current.id, { phase: value <= 0 ? "overtime" : "running", remaining: value });
    }
    setNow(timestamp);
  }, [updateNote]);

  const reset = useCallback(() => {
    const current = latest.current;
    deadline.current = null;
    updateNote(current.id, { phase: "idle", remaining: current.duration });
    setNow(Date.now());
  }, [updateNote]);

  const setDuration = useCallback((seconds) => {
    const current = latest.current;
    const timestamp = Date.now();
    const value = changeDuration(
      current,
      seconds,
      remainingAt(current, timestamp, deadline.current),
      deadline.current,
      timestamp,
    );
    deadline.current = value.deadline;
    updateNote(current.id, { duration: value.duration, remaining: value.remaining, phase: value.phase });
    setNow(timestamp);
  }, [updateNote]);

  const setMode = useCallback((mode) => updateNote(latest.current.id, { mode }), [updateNote]);

  const setFormat = useCallback((change) => {
    const current = latest.current;
    const format = typeof change === "function" ? change(current.format) : change;
    updateNote(current.id, { format });
  }, [updateNote]);

  const stamp = useCallback((date = new Date()) => makeStamp(latest.current, remaining, date), [remaining]);

  return {
    mode: note.mode,
    format: note.format,
    phase: note.phase,
    duration: note.duration,
    remaining,
    readout,
    isRunning: note.phase === "running" || note.phase === "overtime",
    stamp,
    toggle,
    reset,
    setDuration,
    setMode,
    setFormat,
  };
}
