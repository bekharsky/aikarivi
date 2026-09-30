#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
output_dir="${1:-$repo_root/build/hero-timelapse}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
native_dir="$output_dir/native"
mkdir -p "$native_dir/HeroCapture.app/Contents/MacOS"
cd "$repo_root"

command -v ffmpeg >/dev/null

# Compile the real editor. The capture host is separate from the shipped app.
xcrun swiftc -emit-library -emit-module -module-name AikariviCore \
  Sources/AikariviCore/*.swift \
  -emit-module-path "$native_dir/AikariviCore.swiftmodule" \
  -o "$native_dir/libAikariviCore.dylib" \
  -Xlinker -install_name -Xlinker @rpath/libAikariviCore.dylib
xcrun swiftc -emit-library -emit-module -module-name AikariviEditor \
  Sources/AikariviEditor/*.swift -I "$native_dir" -L "$native_dir" -lAikariviCore \
  -emit-module-path "$native_dir/AikariviEditor.swiftmodule" \
  -o "$native_dir/libAikariviEditor.dylib" \
  -Xlinker -install_name -Xlinker @rpath/libAikariviEditor.dylib

# In the temporary copy only, make the native toolbar follow scenario time.
# Fail explicitly if the source changes; never silently capture the wrong clock.
python3 - "$native_dir" <<'PY'
import plistlib
import sys
from pathlib import Path

native = Path(sys.argv[1])
source = Path('Sources/Aikarivi/ContentView.swift').read_text()
replacements = {
    'private struct WallClock: View {\n':
        'private struct WallClock: View {\n    @ObservedObject private var playback = HeroCapture.shared\n',
    'clockString(for: context.date, format: .clock)':
        'clockString(for: playback.date, format: .clock)',
}
for old, new in replacements.items():
    if source.count(old) != 1:
        raise SystemExit('ContentView clock changed; update the capture adapter.')
    source = source.replace(old, new)
(native / 'ContentView.swift').write_text(source)
(native / 'HeroCapture.app/Contents/Info.plist').write_bytes(plistlib.dumps({
    'CFBundleExecutable': 'HeroCapture',
    'CFBundleIdentifier': 'app.aikarivi.hero-capture',
    'CFBundleName': 'Aikarivi Hero Capture',
    'CFBundlePackageType': 'APPL',
    'NSHighResolutionCapable': True,
}))
PY

xcrun swiftc -suppress-warnings Tools/hero-timelapse/Capture.swift \
  "$native_dir/ContentView.swift" Sources/Aikarivi/TimedNoteDocument.swift \
  -I "$native_dir" -L "$native_dir" -lAikariviCore -lAikariviEditor \
  -Xlinker -rpath -Xlinker "$native_dir" \
  -o "$native_dir/HeroCapture.app/Contents/MacOS/HeroCapture"

"$native_dir/HeroCapture.app/Contents/MacOS/HeroCapture" \
  --scenario "$repo_root/scenarios/01-day-in-motion.md" --output "$output_dir"

ffmpeg -hide_banner -loglevel warning -y \
  -safe 0 -f concat -i "$output_dir/frames.ffconcat" \
  -i "$repo_root/docs/assets/day-clean.png" \
  -filter_complex '[1:v]crop=188:104:0:0[controls];[0:v][controls]overlay=0:0:format=auto[video]' \
  -map '[video]' \
  -an -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -r 30 -fps_mode cfr -movflags +faststart \
  "$output_dir/day-timelapse.mp4"

# Export the same clean final frame as a reusable poster. macOS can replace the
# traffic lights with its purple sharing indicator during capture; only this
# static corner comes from the original screenshot, in the exported media.
ffmpeg -hide_banner -loglevel warning -y \
  -sseof -0.1 -i "$output_dir/day-timelapse.mp4" \
  -frames:v 1 -update 1 "$output_dir/day-timelapse-poster.png"

printf 'Video: %s\nPoster: %s\n' "$output_dir/day-timelapse.mp4" "$output_dir/day-timelapse-poster.png"
