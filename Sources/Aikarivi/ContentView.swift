import AppKit
import SwiftUI
import AikariviCore
import AikariviEditor
import UniformTypeIdentifiers

struct ContentView: View {
    @ObservedObject var document: TimedNoteDocument
    @Environment(\.undoManager) private var undoManager

    /// Toolbar items are dropped by hand as the window narrows. Letting AppKit
    /// collect them into its overflow menu instead puts the one button that
    /// must stay reachable — Copy — behind a chevron.
    ///
    /// Starts at zero, so the first frame of a narrow window is the small
    /// toolbar rather than a full one that immediately collapses.
    @State private var width: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            NoteEditorView(controller: document.editor)
            Divider()
            StatusBar(editor: document.editor, timer: document.timer)
        }
        .frame(minWidth: 420, minHeight: 320)
        .background(WidthReader(width: $width))
        .background(WindowAppearanceConfigurator())
        .onDrop(
            of: [UTType.fileURL.identifier, UTType.text.identifier, UTType.plainText.identifier],
            isTargeted: nil,
            perform: handleDrop
        )
        .toolbar {
            // The mode picker leads: it decides what the whole gutter means, so
            // it stays put at every width, unlike the transport beside it.
            ToolbarItem(placement: .navigation) {
                StampModePicker(editor: document.editor, showsTitles: width >= 700)
            }
            // Centre stage goes to the time the next line will be stamped with:
            // the countdown with its transport, or the clock on the wall.
            ToolbarItem(placement: .principal) {
                StampClock(
                    editor: document.editor,
                    timer: document.timer,
                    showsReset: width >= 620
                )
            }
            ToolbarItem(placement: .primaryAction) {
                CopyStampsButton(editor: document.editor, copy: document.copyWithStamps)
            }
        }
        .toolbarRole(.editor)
        .focusedSceneValue(\.timedNote, document)
        .onAppear { [document] in
            // Editing through the document's undo manager is also what tells
            // SwiftUI the note is dirty and enables Save.
            document.editor.hostUndoManager = undoManager
            document.editor.onFileDrop = { [weak document] url in
                document?.handleDroppedFile(at: url)
            }
            document.editor.focus()
        }
        .onChange(of: undoManager) { document.editor.hostUndoManager = $0 }
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }

        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                guard let url = Self.fileURL(from: item) else { return }
                DispatchQueue.main.async {
                    document.handleDroppedFile(at: url)
                }
            }
            return true
        }

        let textType = provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
            ? UTType.plainText.identifier
            : UTType.text.identifier
        provider.loadDataRepresentation(forTypeIdentifier: textType) { data, _ in
            guard let data, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                document.appendDroppedText(text)
            }
        }
        return true
    }

    private static func fileURL(from item: NSSecureCoding?) -> URL? {
        if let url = item as? URL { return url }
        if let url = item as? NSURL { return url as URL }
        if let data = item as? Data {
            return URL(dataRepresentation: data, relativeTo: nil)
        }
        if let path = item as? String {
            return URL(fileURLWithPath: path)
        }
        return nil
    }
}

/// macOS 27 puts an opaque toolbar material behind a document window by
/// default. Keep the native toolbar and its Liquid Glass controls, but let the
/// white document background continue through the titlebar.
private struct WindowAppearanceConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        NSView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            guard let window = nsView.window else { return }
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .visible
            window.backgroundColor = .white
        }
    }
}

/// Reports the window's content width without taking part in the layout.
private struct WidthReader: View {
    @Binding var width: CGFloat

    var body: some View {
        GeometryReader { proxy in
            Color.clear
                .onAppear { width = proxy.size.width }
                .onChange(of: proxy.size.width) { width = $0 }
        }
    }
}

private struct PlayPauseButton: View {
    @ObservedObject var timer: TimerEngine

    var body: some View {
        Button(action: timer.toggle) {
            // Titled, not just an icon: whatever the toolbar cannot fit ends up
            // in the overflow menu, where a bare glyph says nothing.
            Label(
                timer.phase.isActive ? "Pause Timer" : "Start Timer",
                systemImage: timer.phase.isActive ? "pause.fill" : "play.fill"
            )
        }
        .help(timer.phase.isActive ? "Pause the timer (⇧⌘P)" : "Start the timer (⇧⌘P)")
    }
}

private struct ResetButton: View {
    @ObservedObject var timer: TimerEngine

    var body: some View {
        Button {
            timer.reset()
        } label: {
            Label("Reset Timer", systemImage: "arrow.counterclockwise")
        }
        .disabled(timer.phase == .idle)
        .help("Reset the timer (⇧⌘R)")
    }
}

/// Whichever time the next line is about to get. The transport belongs to the
/// countdown, so it comes and goes with it — in clock mode there is no session
/// to start or reset, only the time of day.
private struct StampClock: View {
    @ObservedObject var editor: NoteEditorController
    @ObservedObject var timer: TimerEngine
    var showsReset: Bool

    var body: some View {
        switch editor.stampMode {
        case .countdown:
            // No spacing of its own: each button already carries its own hit
            // area, and anything added here reads as a gap between the
            // transport and the number it drives.
            HStack(spacing: 0) {
                PlayPauseButton(timer: timer)
                if showsReset {
                    ResetButton(timer: timer)
                }
                TimerClock(timer: timer)
            }
        case .clock:
            WallClock()
        }
    }
}

/// The time of day, ticking. Not a button: there is nothing to set about it.
private struct WallClock: View {
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .imageScale(.large)
                Text(StampFormatter.clockString(for: context.date, format: .clock))
                    .monospacedDigit()
            }
            .padding(.horizontal, 6)
        }
        .help("Time of day — what the next line will be stamped with")
    }
}

/// The countdown, and the only place the duration is set. Nothing else in the
/// toolbar repeats the number.
private struct TimerClock: View {
    @ObservedObject var timer: TimerEngine
    @State private var isSettingDuration = false

    var body: some View {
        Button {
            isSettingDuration = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "timer")
                    .imageScale(.large)
                Text(StampFormatter.string(for: timer.remaining, format: .clock))
                    .monospacedDigit()
                    .foregroundStyle(color)
            }
        }
        .help(helpText)
        .popover(isPresented: $isSettingDuration, arrowEdge: .bottom) {
            DurationEditor(timer: timer)
        }
    }

    /// Colour means "the clock is doing something". A stopped timer — never
    /// started, or paused — is just a number, so it stays plain.
    private var color: Color {
        switch timer.phase {
        case .idle, .paused: return .secondary
        case .running: return .primary
        case .overtime: return .red
        }
    }

    private var helpText: String {
        switch timer.phase {
        case .idle: return "Timer not started — click to set the duration"
        case .running: return "Time left — click to set the duration"
        case .paused: return "Paused — click to set the duration"
        case .overtime: return "Over the planned time — click to set the duration"
        }
    }
}

/// Copies the note the way it looks right now: stamps at the detail level on
/// screen, not the full precision kept in the file.
private struct CopyStampsButton: View {
    @ObservedObject var editor: NoteEditorController
    let copy: () -> Void

    @State private var justCopied = false

    var body: some View {
        Button {
            copy()
            justCopied = true
            Task {
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                justCopied = false
            }
        } label: {
            Label("Copy with Timestamps", systemImage: justCopied ? "checkmark" : "doc.on.doc")
        }
        .help(helpText)
    }

    private var helpText: String {
        guard !editor.format.isEmpty else {
            return "Copy the selection without timestamps (⇧⌘C)"
        }
        let sample: String
        if let stamp = editor.caretStamp {
            sample = StampFormatter.string(for: stamp, format: editor.format)
        } else {
            return "Copy timestamps where present; unstamped text stays plain (⇧⌘C)"
        }
        return "Copy the selection with timestamps as shown, like [\(sample)] (⇧⌘C)"
    }
}

private struct StatusBar: View {
    @ObservedObject var editor: NoteEditorController
    @ObservedObject var timer: TimerEngine

    var body: some View {
        HStack(spacing: 12) {
            Text("Line \(editor.caretLine + 1) of \(editor.lineCount)")
            Text(stampDescription)
                .monospacedDigit()
            Spacer()
            DetailMenu(format: $editor.format, mode: editor.stampMode)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
        .background(.bar)
    }

    private var stampDescription: String {
        guard let stamp = editor.caretStamp else {
            if editor.stampMode == .clock {
                return "no stamp yet"
            }
            return timer.phase == .idle ? "line written before the timer started" : "no stamp yet"
        }
        // The line's own kind, not the toolbar's: this describes what is there.
        switch stamp.kind {
        case .countdown:
            guard let remaining = stamp.remaining else { return "no countdown on this line" }
            return "started with \(StampFormatter.string(for: remaining, format: .exact)) left"
        case .clock:
            guard let wallClock = stamp.wallClock else { return "no clock time on this line" }
            return "started at \(StampFormatter.clockString(for: wallClock, format: .exact))"
        }
    }
}

/// What a new line gets stamped with. Two modes, side by side in the toolbar,
/// because switching them changes every stamp the app writes from then on —
/// countdown for a timed session, clock for journalling through the day.
private struct StampModePicker: View {
    @ObservedObject var editor: NoteEditorController
    var showsTitles: Bool

    var body: some View {
        Picker("Stamps", selection: $editor.stampMode) {
            item(.countdown, title: "Countdown", symbol: "timer")
            item(.clock, title: "Time of Day", symbol: "clock")
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .fixedSize()
        .help(editor.stampMode == .countdown
            ? "New lines are stamped with the time left on the timer"
            : "New lines are stamped with the time of day, timer or not")
    }

    @ViewBuilder
    private func item(_ mode: StampMode, title: String, symbol: String) -> some View {
        if showsTitles {
            Label(title, systemImage: symbol)
                .padding(.horizontal, 6)
                .tag(mode)
        } else {
            // Narrow window: the glyphs carry it, and the titles are still in
            // the Timer menu. They need the room a title would have taken, or
            // the two segments read as one smudge.
            Image(systemName: symbol)
                .frame(width: 22)
                .padding(.horizontal, 4)
                .tag(mode)
        }
    }
}

/// The detail level lives down here rather than in the toolbar. It is a setting
/// touched rarely, the status bar already had to spell it out, and a menu of
/// named units says far more than four cryptic letters ever did.
private struct DetailMenu: View {
    @Binding var format: StampFormat
    var mode: StampMode

    var body: some View {
        Menu {
            Toggle("Hours", isOn: $format.hours)
            Toggle("Minutes", isOn: $format.minutes)
            Toggle("Seconds", isOn: $format.seconds)
            Toggle("Tenths", isOn: $format.subseconds)
                .disabled(!format.seconds)
            Divider()
            Button("Exact Time") { format = .exact }
            Button("Minutes Only") { format = .minutesOnly }
        } label: {
            Text(title)
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }

    private var title: String {
        guard !format.isEmpty else { return "stamps hidden" }

        var units: [String] = []
        if format.hours { units.append(mode == .clock ? "H" : "h") }
        if format.minutes { units.append("m") }
        if format.seconds { units.append(format.subseconds ? "s.1" : "s") }
        return units.joined(separator: ":")
    }
}

private struct DurationEditor: View {
    @ObservedObject var timer: TimerEngine

    @State private var hours = 1
    @State private var minutes = 0
    @State private var seconds = 0

    private let presets: [(String, TimeInterval)] = [
        ("15m", 15 * 60),
        ("25m", 25 * 60),
        ("45m", 45 * 60),
        ("1h", 3600),
        ("1h30", 90 * 60),
        ("2h", 2 * 3600)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Timer duration")
                .font(.headline)

            HStack(spacing: 6) {
                ForEach(presets, id: \.0) { preset in
                    Button(preset.0) { apply(duration: preset.1) }
                }
            }

            Divider()

            HStack(spacing: 14) {
                Stepper("Hours: \(hours)", value: $hours, in: 0...23)
                Stepper("Minutes: \(minutes)", value: $minutes, in: 0...59)
                Stepper("Seconds: \(seconds)", value: $seconds, in: 0...59)
            }
            .monospacedDigit()

            if timer.phase.isActive {
                Text("The running timer shifts by the difference.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(width: 420)
        .onAppear(perform: seedFields)
        .onChange(of: hours) { _ in pushFields() }
        .onChange(of: minutes) { _ in pushFields() }
        .onChange(of: seconds) { _ in pushFields() }
    }

    private func seedFields() {
        let total = Int(timer.duration.rounded())
        hours = total / 3600
        minutes = (total % 3600) / 60
        seconds = total % 60
    }

    private func apply(duration: TimeInterval) {
        timer.setDuration(duration)
        seedFields()
    }

    private func pushFields() {
        timer.setDuration(TimeInterval(hours * 3600 + minutes * 60 + seconds))
    }
}
