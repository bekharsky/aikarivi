import AppKit
import Combine
import SwiftUI
import TimedNotesCore
import TimedNotesEditor
import UniformTypeIdentifiers

extension UTType {
    /// Older notes used a private `.timednote` extension. The bytes are still
    /// Markdown; this type only exists so Finder can hand those files back.
    static let legacyTimedNote = UTType(importedAs: "com.kharion.tickline.legacy-note")
}

/// One note, one timer, one window.
///
/// AppKit builds documents on a background queue whenever a file is opened from
/// a URL, so this half holds nothing but the bytes that were read. The timer and
/// the editor are AppKit objects and only come to life in `session`, on the main
/// thread, when a window finally asks for them.
final class TimedNoteDocument: ReferenceFileDocument {
    typealias Snapshot = NoteSnapshot

    /// Save as ordinary Markdown. The timer and stamps live in the text, so
    /// the filename does not have to advertise the format.
    static var readableContentTypes: [UTType] {
        [Self.markdownType, .plainText, .legacyTimedNote]
    }
    static var writableContentTypes: [UTType] { [Self.markdownType] }

    /// `UTType.markdown` is not always in the SDK this package builds against.
    /// The filename tag is enough: `.md` is Markdown everywhere that matters.
    private static let markdownType = UTType(filenameExtension: "md") ?? .plainText

    /// Bumped on every change so SwiftUI knows the document needs saving.
    @Published private(set) var revision = 0

    private let loaded: NoteSnapshot?
    private var live: NoteSession?

    /// What the last change left behind, readable from any thread. Saving can
    /// arrive on a background queue, and this is what it reads there.
    private let mirrorLock = NSLock()
    private var mirror: NoteSnapshot?

    init() {
        loaded = nil
    }

    required init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents,
              let text = String(data: data, encoding: .utf8)
        else { throw CocoaError(.fileReadCorruptFile) }

        loaded = MarkdownNote.snapshot(from: text)
    }

    @MainActor var timer: TimerEngine { session.timer }
    @MainActor var editor: NoteEditorController { session.editor }

    @MainActor var session: NoteSession {
        if let live { return live }
        let session = NoteSession(loaded: loaded) { [weak self] session in
            guard let self else { return }
            self.revision &+= 1
            self.store(mirror: session.currentSnapshot())
        }
        live = session
        return session
    }

    func snapshot(contentType: UTType) throws -> NoteSnapshot {
        if Thread.isMainThread {
            return MainActor.assumeIsolated { session.currentSnapshot() }
        }

        // `ReferenceFileDocument` is `Sendable`: nothing promises this runs on
        // the main thread. AppKit's save machinery hands file access to a
        // background queue while the main thread waits for it, so hopping back
        // to read the live editor would deadlock the app instead of saving it.
        // The mirror is written by every change, on the main thread, and is
        // exactly what the last edit produced.
        return mirroredSnapshot ?? loaded ?? Self.emptyNote
    }

    private static let emptyNote = NoteSnapshot(
        duration: 3600,
        heldRemaining: nil,
        format: .clock,
        lines: [NoteSnapshot.Line(text: "", stamp: nil)]
    )

    func fileWrapper(snapshot: NoteSnapshot, configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(MarkdownNote.text(for: snapshot).utf8))
    }

    // MARK: - Output

    /// Copies the selected lines with their stamps, or the whole note when
    /// nothing is selected.
    @MainActor
    func copyWithStamps() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(editor.stampedText(selectionOnly: true), forType: .string)
    }

    @MainActor
    func exportToFile() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "tickline.txt"
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let url = panel.url else { return }
        try? editor.stampedText(selectionOnly: false).write(to: url, atomically: true, encoding: .utf8)
    }

    /// A text file dropped onto an empty window becomes a real document. A
    /// non-empty note keeps its document identity and receives the file text at
    /// the end instead.
    @MainActor
    func handleDroppedFile(at url: URL) {
        guard url.isFileURL else { return }

        let didStartAccessing = url.startAccessingSecurityScopedResource()
        defer {
            if didStartAccessing { url.stopAccessingSecurityScopedResource() }
        }

        guard let data = try? Data(contentsOf: url),
              let text = String(data: data, encoding: .utf8)
        else {
            NSSound.beep()
            return
        }

        if editor.textView.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            NSDocumentController.shared.openDocument(withContentsOf: url, display: true) { _, _, error in
                if error != nil { NSSound.beep() }
            }
        } else {
            editor.appendText(text)
        }
    }

    @MainActor
    func appendDroppedText(_ text: String) {
        editor.appendText(text)
    }

    private func store(mirror snapshot: NoteSnapshot) {
        mirrorLock.lock()
        mirror = snapshot
        mirrorLock.unlock()
    }

    private var mirroredSnapshot: NoteSnapshot? {
        mirrorLock.lock()
        defer { mirrorLock.unlock() }
        return mirror
    }
}

/// The living note: the timer, the editor, and the wiring that marks the
/// document dirty when either of them moves.
@MainActor
final class NoteSession {
    let timer = TimerEngine()
    let editor = NoteEditorController()

    private let changed: (NoteSession) -> Void
    private var cancellables: Set<AnyCancellable> = []
    private var isApplyingFile = false

    init(loaded: NoteSnapshot?, changed: @escaping (NoteSession) -> Void) {
        self.changed = changed

        editor.timer = timer
        editor.onChange = { [weak self] in self?.markChanged() }

        timer.$phase
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] phase in
                if phase == .overtime {
                    NSSound.beep()
                }
                self?.editor.refreshGutter(resize: false)
                self?.markChanged()
            }
            .store(in: &cancellables)

        timer.$duration
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] _ in
                self?.editor.refreshGutter(resize: true)
                self?.markChanged()
            }
            .store(in: &cancellables)

        editor.$format
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] _ in self?.markChanged() }
            .store(in: &cancellables)

        editor.$stampMode
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] _ in
                self?.editor.refreshGutter(resize: true)
                self?.markChanged()
            }
            .store(in: &cancellables)

        if let loaded {
            apply(loaded)
        }
    }

    func currentSnapshot() -> NoteSnapshot {
        NoteSnapshot(
            duration: timer.duration,
            heldRemaining: timer.exactRemaining,
            format: editor.format,
            stampMode: editor.stampMode,
            lines: editor.lines()
        )
    }

    private func apply(_ snapshot: NoteSnapshot) {
        isApplyingFile = true
        editor.format = snapshot.format
        editor.stampMode = snapshot.stampMode
        timer.restore(duration: snapshot.duration, heldRemaining: snapshot.heldRemaining)
        editor.load(lines: snapshot.lines)
        isApplyingFile = false
    }

    /// Opening a file is not an edit, or every note would open pre-dirtied.
    private func markChanged() {
        guard !isApplyingFile else { return }
        changed(self)
    }
}
