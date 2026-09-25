# Aikarivi

[Website](https://bekharsky.github.io/aikarivi/) ·
[GitHub](https://github.com/bekharsky/aikarivi)

A native macOS notepad that stamps each line with a time. It can count down
a session timer, or it can stamp the time of day like an interstitial journal.
The two modes share the same editor: a line is marked when you start writing it,
the detail level is reversible, and notes are ordinary Markdown.

The point is the detail level. The app always stores the exact moment a line
started, down to fractions of a second, but shows only the units you asked for.
On a one-hour timer you can keep just minutes on screen and get the full
`00:53:32.4` back at any time, including long after the writing is done.

```
01:00:00  first thought
00:53:32  something else came up
00:00:45  wrapping up
-00:02:10  one more thing after the bell
```

## How it works

Stamps are not part of the text. Each paragraph has a stamp stored next to it and
drawn in the left gutter, so a timestamp cannot be typed over, deleted by
accident, or copied into the middle of a sentence — and changing the detail level
is only a redraw.

- **A line is stamped by its first character, not by Return.** Breaking the line
  early and then thinking for a minute costs nothing: the empty line waits, and
  takes the time you actually start writing. While it waits, the gutter shows
  `--:--:--` with blinking separators — a stamp is coming, it just does not know
  which one yet. Editing inside a line keeps its original stamp, and splitting an
  old line stamps the new tail.
- **A blank line left for spacing stays blank in the gutter.** Nothing was
  written on it, so it has no time to show, and Return pressed on it again only
  pushes it down.
- **⌘Return breaks a line without a new stamp.** The text moves to the next
  visual row but stays in the same paragraph, so it keeps the stamp it already
  has, and nothing blinks — there is no new line to wait for. ⌥Return does the
  same.
- **Pasting a block** stamps every line it creates with the current time left.
- **A line written before the timer started** has no countdown stamp, shows
  `--:--:--` and keeps it that way. Editing it later never backdates it; only
  lines you write under a running timer get a remaining time. Switch the toolbar
  from countdown to the clock and new lines take the time of day instead, even
  with the timer idle — that is the interstitial-journal mode.
- **A line keeps the kind of time it was written with.** Switching modes decides
  what the next line gets and rewrites nothing: countdown lines go on showing the
  countdown, clock lines go on showing the clock, and a note where you changed
  your mind half way through stays a record of that. The timer keeps running
  through the switch, so a clock line written while it ticks quietly keeps the
  remaining time too.
- **Overtime keeps counting.** After the bell, stamps go negative instead of
  stopping at zero.

## Toolbar

| Control | What it does |
| --- | --- |
| ⏱ / 🕐 | The mode: stamp the time left, or the time of day (⇧⌘T / ⇧⌘D) |
| ▶︎ / ▮▮ | Start, pause, resume (⇧⌘P). Countdown mode only |
| ↺ | Reset the timer (⇧⌘R). Countdown mode only |
| centre | The time the next line will get: the countdown, or the wall clock. Click the countdown to set the duration — changing it mid-session moves the deadline by the difference |
| ⧉ | Copy with timestamps exactly as shown (⇧⌘C) |

In clock mode the timer controls go away entirely; the centre shows the current
time instead. The timer is still there — ⇧⌘P from the Timer menu starts it, and
lines written with it running keep both times.

Stamp detail lives in the status bar: click `h:m:s` (or `H:m:s` in clock mode)
for Hours, Minutes, Seconds, and Tenths (⌘1 … ⌘4). Exact time is ⌘0; minutes
only is ⌘9.

Turning a larger unit off rolls it into the next one: with hours off, an hour
left reads as `60` minutes, not `00`. Turning everything off hides the gutter.

**Copy with Timestamps** — the ⧉ button, ⇧⌘C, or the Edit menu — puts the stamps
back in front of the lines you selected, cutting the first and last line down to
the selection and keeping their stamps. With nothing selected it copies the whole
note. It always uses the detail on screen, never the full precision from the
file, so pasting minutes-only notes elsewhere stays clean; with every unit off it
copies bare text. A plain ⌘C still copies the text alone, and **Export as Text…**
(⌘E) writes the stamped version to any file.

A line broken with ⌘Return is copied as a real newline indented under the stamp
column, so one screen line stays one line of output.

## Files

Notes are ordinary Markdown documents: ⌘N, ⌘O, ⌘S, Save As, several windows at
once, each with its own timer. Aikarivi does not invent an extension. It writes
`.md`, and on open it looks at the text: a front matter block and `[HH:MM:SS.mmm]`
prefixes are a timed note, everything else is unstamped Markdown. Any editor or
Quick Look can read the file:

```
---
timer: 01:00:00
remaining: 00:41:12.400
detail: h:m
---

[00:59:56.246 @ 2026-09-07T14:32:05.123] started the review
[00:58:12.900] the numbers in section 3 do not add up
               checked twice, still off by 400
[@ 2026-09-07T14:41:22.500] switched to clock stamps here
[--:--:--.---] jotted down before the timer started
```

Stamps in the file are always written at full precision, whatever the status bar
shows, so the detail level stays free to change after reopening. Whichever time
comes first is the kind the line was written with; a second one after it is what
the other clock happened to read at that moment. A note that says
`stamps: clock` in its front matter is one where new lines take the time of day.
The front matter also carries the timer setup, and lines you broke with ⌘Return
come back indented.
Older `.timednote` files still open: they are the same Markdown under a private
extension.

A reopened note starts **paused** — real time passed while the file was closed,
and pretending otherwise would corrupt every later stamp.

Shortened stamps like `[45]` from a copied note are ambiguous between minutes
and seconds and so are read as plain text.

## Build and run

```sh
xcodebuild -project Aikarivi.xcodeproj -scheme Aikarivi \
  -configuration Debug \
  -derivedDataPath .build/xcode \
  CODE_SIGNING_ALLOWED=NO build
open .build/xcode/Build/Products/Debug/Aikarivi.app
```

For tests or a release archive, use the same Xcode scheme:

```sh
xcodebuild -project Aikarivi.xcodeproj -scheme Aikarivi \
  -destination 'platform=macOS' test
xcodebuild -project Aikarivi.xcodeproj -scheme Aikarivi \
  -configuration Release archive
```

Xcode Cloud uses `ci_scripts/ci_post_clone.sh` to write
`CI_BUILD_NUMBER` into `CURRENT_PROJECT_VERSION`; the cloud build number is
the release source of truth, while the value in `AppInfo.xcconfig` is a local
fallback.

The App Store archive workflow watches the `release` branch. Normal development
lands on `main`; merge `main` into `release` when a version is ready to produce
the signed release archive.

The App Store marketing version lives in the same config. Bump it before a
release with one of:

```sh
./bump-version.sh --patch
./bump-version.sh --minor
./bump-version.sh --major
```

The packaging script reads `AppInfo.xcconfig` first and `Local.xcconfig` second,
so anything in the local file wins. Copy `Local.xcconfig.example` to
`Local.xcconfig` to override the bundle identifier, copyright, team, or signing
identity on one machine. `Local.xcconfig` is gitignored and is never needed by
Xcode Cloud. The production bundle identifier and Team ID in `AppInfo.xcconfig`
are public application metadata; certificates and private keys remain in the
developer keychain and Apple services.

The application bundle identifier and the legacy document type identifier retain
their original values for App Store, sandbox, and document compatibility. The
product, executable, Xcode scheme, and Swift modules are named Aikarivi.

Requires macOS 13 or later.

## Website

The GitHub Pages site is served from `docs/`. Changes pushed to `main` publish
automatically through `.github/workflows/pages.yml` at
<https://bekharsky.github.io/aikarivi/>.

The download is `docs/assets/Aikarivi-macOS.zip`, containing the Xcode-built
`Aikarivi.app` with its icon and frameworks.

## Layout

| Target | Contents |
| --- | --- |
| `AikariviCore` | Timer, stamp formatting, and the bookkeeping that keeps stamps aligned with the text through arbitrary edits. No UI. |
| `AikariviEditor` | The AppKit text view and the gutter that draws the stamps. The gutter is a plain sibling view with its own layout, not an `NSRulerView`: the ruler tiling machinery fights SwiftUI's sizing of the scroll view and offsets the clip view until the text stops being drawn at all. |
| `Aikarivi` | SwiftUI app, toolbar, menu commands. The product name on disk is Aikarivi. |

The split exists so the risky parts can be tested: `StampBookkeeperTests` replays
real typing sequences, `TypingTests` types into a live text view, and
`GutterRenderTests` renders offscreen — including a note hosted in a real SwiftUI
window, which is how the missing-text bug above was found and is kept from
returning.

## Known gaps

- Undo restores the text, but a line recreated by undo is stamped with the time
  at which you pressed undo, not its original one.
