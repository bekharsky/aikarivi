# Hero timelapse

The source is `scenarios/01-day-in-motion.md`. The capture host uses the real
SwiftUI window, `NoteEditorController`, timestamp gutter and Markdown serializer.
Every character is inserted through `NSTextView.insertText`. Each PNG frame has
a matching Markdown file in the output directory.

The demo deliberately shows the stored timestamp on an empty line before typing.
In normal use Aikarivi assigns the timestamp on the first character. The toolbar
clock follows scenario time; the caret uses TextKit's insertion rect with a
deterministic blink. No production app source is changed.

The exported video's traffic-light corner comes from the original screenshot:
macOS may replace those controls with a screen-sharing indicator while capturing.
This affects only the exported media; the system indicator remains visible on
the desktop. All note text, timestamps, toolbar clock and status are rendered
from the native window for each frame.

## Render

On an unlocked Mac with Xcode, Python 3 and FFmpeg installed:

```sh
bash Tools/hero-timelapse/render.sh
```

Bring the **Aikarivi Hero Capture** window to the front when prompted and keep it
there during capture (recording pauses if another app takes focus). The script
renders its own window into Retina bitmaps; screen recording permission is not
needed. The capture window closes when finished. The output is a silent
1800 × 900, 30 fps MP4 with a three-second final hold, plus a full-note poster.

Install the generated media in the landing page:

```sh
cp build/hero-timelapse/day-timelapse.mp4 docs/assets/
```

The landing page keeps the original `day-clean.png` as its static fallback. The
generated poster is also available in the output directory for other uses.

The website starts playback when the hero enters view, pauses when it leaves,
and offers a pause button. Reduced-motion visitors get the complete static note
and can explicitly choose to play it. Without JavaScript the poster remains.
