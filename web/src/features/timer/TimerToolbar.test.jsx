import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimerToolbar } from "./TimerToolbar.jsx";

function createTimer(overrides = {}) {
  const [format, setFormat] = useState({ hours: true, minutes: true, seconds: true, tenths: false });
  const [mode, setMode] = useState("countdown");
  const setFormatValue = (change) => setFormat((current) => typeof change === "function" ? change(current) : change);
  return {
    mode,
    format,
    phase: "idle",
    duration: 3600,
    remaining: 3600,
    readout: mode === "clock" ? "06:42:15" : "01:00:00",
    isRunning: false,
    setMode,
    setFormat: setFormatValue,
    setDuration: vi.fn(),
    toggle: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function TimerHarness() {
  const timer = createTimer();
  return <TimerToolbar timer={timer} />;
}

describe("timer toolbar composition", () => {
  it("keeps the shared timer toolbar flat", () => {
    render(<TimerHarness />);
    expect(screen.getByRole("region", { name: "Time and writing settings" })).toHaveClass("ui-surface--flat");
  });

  it("opens timer settings from the entire readout and closes after selecting a duration", async () => {
    const user = userEvent.setup();
    const setDuration = vi.fn();
    function Harness() {
      const timer = createTimer({ setDuration });
      return <TimerToolbar timer={timer} />;
    }
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Timer duration settings" });
    await user.click(screen.getByText("01:00:00"));
    expect(screen.getByRole("heading", { name: "Timer duration" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "25 min" }));

    expect(setDuration).toHaveBeenCalledWith(1500);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Timer duration" })).not.toBeInTheDocument());
    expect(trigger).toBeInTheDocument();
  });

  it("closes timer settings on outside clicks and a repeated trigger click", async () => {
    const user = userEvent.setup();
    render(<TimerHarness />);
    const readout = screen.getByText("01:00:00");

    await user.click(readout);
    expect(screen.getByRole("heading", { name: "Timer duration" })).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Timer duration" })).not.toBeInTheDocument());

    await user.click(readout);
    expect(screen.getByRole("heading", { name: "Timer duration" })).toBeInTheDocument();
    await user.click(readout);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Timer duration" })).not.toBeInTheDocument());
  });

  it("offers timestamp precision for both clock and countdown modes", async () => {
    const user = userEvent.setup();
    render(<TimerHarness />);
    await user.click(screen.getByRole("button", { name: "Timestamp detail h:m:s" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Seconds" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Tenths" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Tenths" }));
    expect(screen.getByRole("menu", { name: "Timestamp detail h:m:s.1" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Timestamp detail h:m:s.1" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Time of day" }));
    expect(screen.getByRole("button", { name: "Timestamp detail h:m:s.1" })).toBeInTheDocument();
  });

  it("starts and resets only through the shared transport controls", () => {
    const toggle = vi.fn();
    const reset = vi.fn();
    function Harness() {
      return <TimerToolbar timer={createTimer({ toggle, reset })} />;
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Reset timer" })).toBeDisabled();
  });

  it("supports arrow-key mode switching through the accessible segmented control", async () => {
    render(<TimerHarness />);
    screen.getByRole("radio", { name: "Countdown" }).focus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Countdown" }), { key: "ArrowRight" });

    await waitFor(() => expect(screen.getByRole("radio", { name: "Time of day" })).toHaveAttribute("aria-checked", "true"));
  });
});
