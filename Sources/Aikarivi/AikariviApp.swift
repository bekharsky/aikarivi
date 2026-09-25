import SwiftUI
import AikariviCore
import AikariviEditor

@main
struct AikariviApp: App {
    init() {
        LegacySessionRecovery.scheduleOnce()
    }

    var body: some Scene {
        DocumentGroup(newDocument: { TimedNoteDocument() }) { configuration in
            ContentView(document: configuration.document)
        }
        .commands {
            CommandGroup(after: .pasteboard) {
                Divider()
                CopyCommands()
            }
            CommandMenu("Timer") {
                TimerMenu()
            }
        }
    }
}

/// Lets the menu bar act on whichever note window is in front.
private struct FocusedDocumentKey: FocusedValueKey {
    typealias Value = TimedNoteDocument
}

extension FocusedValues {
    var timedNote: TimedNoteDocument? {
        get { self[FocusedDocumentKey.self] }
        set { self[FocusedDocumentKey.self] = newValue }
    }
}

private struct CopyCommands: View {
    @FocusedValue(\.timedNote) private var document

    var body: some View {
        Button("Copy with Timestamps") { document?.copyWithStamps() }
            .keyboardShortcut("c", modifiers: [.command, .shift])
            .disabled(document == nil)
    }
}

private struct TimerMenu: View {
    @FocusedValue(\.timedNote) private var document

    var body: some View {
        if let document {
            TimerCommands(timer: document.timer)
            Divider()
            DetailCommands(editor: document.editor)
            Divider()
            StampModeCommands(editor: document.editor)
            Divider()
            Button("Export as Text…") { document.exportToFile() }
                .keyboardShortcut("e")
        }
    }
}

private struct TimerCommands: View {
    @ObservedObject var timer: TimerEngine

    var body: some View {
        // Not ⌘⏎: that belongs to the editor, where it breaks a line without
        // starting a new stamp.
        Button(actionTitle) { timer.toggle() }
            .keyboardShortcut("p", modifiers: [.command, .shift])
        Button("Reset Timer") { timer.reset() }
            .keyboardShortcut("r", modifiers: [.command, .shift])
            .disabled(timer.phase == .idle)
    }

    private var actionTitle: String {
        switch timer.phase {
        case .idle: return "Start Timer"
        case .running, .overtime: return "Pause Timer"
        case .paused: return "Resume Timer"
        }
    }
}

private struct DetailCommands: View {
    @ObservedObject var editor: NoteEditorController

    var body: some View {
        Toggle("Show Hours", isOn: $editor.format.hours)
            .keyboardShortcut("1", modifiers: .command)
        Toggle("Show Minutes", isOn: $editor.format.minutes)
            .keyboardShortcut("2", modifiers: .command)
        Toggle("Show Seconds", isOn: $editor.format.seconds)
            .keyboardShortcut("3", modifiers: .command)
        Toggle("Show Tenths", isOn: $editor.format.subseconds)
            .keyboardShortcut("4", modifiers: .command)
            .disabled(!editor.format.seconds)
        Button("Exact Time") { editor.format = .exact }
            .keyboardShortcut("0", modifiers: .command)
        Button("Minutes Only") { editor.format = .minutesOnly }
            .keyboardShortcut("9", modifiers: .command)
    }
}

private struct StampModeCommands: View {
    @ObservedObject var editor: NoteEditorController

    var body: some View {
        Button("Countdown Stamps") { editor.stampMode = .countdown }
            .keyboardShortcut("t", modifiers: [.command, .shift])
        Button("Time of Day Stamps") { editor.stampMode = .clock }
            .keyboardShortcut("d", modifiers: [.command, .shift])
    }
}
