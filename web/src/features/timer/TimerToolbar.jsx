import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Pause, Play, RotateCcw, Settings2 } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button.jsx";
import { PopoverPanel } from "../../components/ui/PopoverPanel.jsx";
import { SegmentedControl } from "../../components/ui/SegmentedControl.jsx";
import { Surface } from "../../components/ui/Surface.jsx";
import { formatDetailLabel } from "../../core/time.js";

const MODES = [
  { value: "countdown", label: "Countdown" },
  { value: "clock", label: "Time of day" },
];
const UNITS = [
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
  { key: "tenths", label: "Tenths" },
];
const PRESETS = [
  { seconds: 900, label: "15 min" },
  { seconds: 1500, label: "25 min" },
  { seconds: 2700, label: "45 min" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 5400, label: "1.5 hours" },
  { seconds: 7200, label: "2 hours" },
];

function TimerDuration({ timer }) {
  const [minutes, setMinutes] = useState(() => String(Math.max(1, Math.round(timer.duration / 60))));
  const [open, setOpen] = useState(false);
  useEffect(() => setMinutes(String(Math.max(1, Math.round(timer.duration / 60)))), [timer.duration]);
  const setAndClose = (seconds) => { timer.setDuration(seconds); setOpen(false); };

  return (
    <PopoverPanel
      trigger={(
        <Button className="timer-trigger" aria-label="Timer duration settings" title="Timer duration settings">
          <span className={`timer-readout${timer.phase === "overtime" ? " is-overtime" : ""}`}>{timer.readout}</span>
          <Settings2 aria-hidden="true" className="ui-icon timer-settings-icon" />
        </Button>
      )}
      label="Timer duration"
      heading="Timer duration"
      className="duration-popover"
      open={open}
      onOpenChange={setOpen}
    >
      <div className="duration-presets" aria-label="Timer presets">
        {PRESETS.map(({ seconds, label }) => (
          <Button key={seconds} variant="subtle" onClick={() => setAndClose(seconds)}>{label}</Button>
        ))}
      </div>
      <form className="custom-duration-form" onSubmit={(event) => {
        event.preventDefault();
        const value = Number(minutes);
        if (Number.isFinite(value) && value > 0) setAndClose(Math.min(1440, value) * 60);
      }}>
        <label htmlFor="custom-minutes">Minutes</label>
        <input
          className="ui-input"
          id="custom-minutes"
          type="number"
          min="1"
          max="1440"
          inputMode="numeric"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
        <Button variant="subtle" type="submit">Set</Button>
      </form>
    </PopoverPanel>
  );
}

function TimestampPrecision({ timer }) {
  const format = timer.format;
  const detail = formatDetailLabel(format);
  const activeUnits = ["hours", "minutes", "seconds"].filter((unit) => format[unit]);

  function toggleUnit(unit, checked) {
    timer.setFormat((current) => {
      const active = ["hours", "minutes", "seconds"].filter((key) => current[key]);
      if (["hours", "minutes", "seconds"].includes(unit) && current[unit] && active.length === 1) return current;
      if (unit === "tenths" && !current.seconds) return current;
      return {
        ...current,
        [unit]: checked,
        ...(unit === "seconds" && !checked ? { tenths: false } : {}),
      };
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button className="detail-trigger" aria-label={`Timestamp detail ${detail}`} title="Timestamp detail">
          <span>{detail}</span><ChevronDown aria-hidden="true" className="ui-icon ui-chevron-icon" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ui-popover detail-popover" align="end" sideOffset={6} collisionPadding={16}>
          <DropdownMenu.Label className="ui-popover-heading">Timestamp detail</DropdownMenu.Label>
          <div className="ui-menu-list" aria-label="Timestamp units">
            {UNITS.map(({ key, label }) => (
              <DropdownMenu.CheckboxItem
                key={key}
                className="ui-menu-item ui-check-item"
                checked={Boolean(format[key])}
                disabled={(key === "tenths" && !format.seconds) || (key !== "tenths" && format[key] && activeUnits.length === 1)}
                onCheckedChange={(checked) => toggleUnit(key, Boolean(checked))}
                onSelect={(event) => event.preventDefault()}
              >
                <DropdownMenu.ItemIndicator className="check-indicator"><Check aria-hidden="true" /></DropdownMenu.ItemIndicator>
                <span>{label}</span>
              </DropdownMenu.CheckboxItem>
            ))}
          </div>
          <DropdownMenu.Separator className="ui-separator ui-separator--horizontal" />
          <DropdownMenu.Item className="ui-menu-item" onSelect={() => timer.setFormat({ hours: true, minutes: true, seconds: true, tenths: true })}>
            Exact time
          </DropdownMenu.Item>
          <DropdownMenu.Item className="ui-menu-item" onSelect={() => timer.setFormat({ hours: false, minutes: true, seconds: false, tenths: false })}>
            Minutes only
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function TimerToolbar({ timer }) {
  return (
    <Surface as="section" variant="flat" className="session-panel" aria-label="Time and writing settings">
      <div className="controls-main">
        <SegmentedControl label="Timestamp mode" value={timer.mode} options={MODES} onValueChange={timer.setMode} />
        {timer.mode === "clock" ? (
          <output className="clock-display" aria-label={`Local time ${timer.readout}`}>{timer.readout}</output>
        ) : (
          <div className="timer-controls" aria-label="Timer">
            <IconButton
              icon={timer.isRunning ? Pause : Play}
              label={timer.isRunning ? "Pause timer" : timer.phase === "paused" ? "Resume timer" : "Start timer"}
              className="transport-button"
              onClick={timer.toggle}
            />
            <IconButton icon={RotateCcw} label="Reset timer" className="reset-button" disabled={timer.phase === "idle"} onClick={timer.reset} />
            <TimerDuration timer={timer} />
          </div>
        )}
        <div className="detail-menu">
          <TimestampPrecision timer={timer} />
        </div>
      </div>
    </Surface>
  );
}
