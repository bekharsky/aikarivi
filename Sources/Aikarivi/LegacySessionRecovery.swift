import AppKit
import AikariviCore

/// Before notes were documents, there was a single autosaved session in
/// Application Support. Anything left in it is written out as a real file once,
/// rather than quietly becoming unreachable.
enum LegacySessionRecovery {
    /// Runs on the first turn of the run loop, never inside `App.init()`: a
    /// modal alert put up before AppKit has finished launching wedges the
    /// launch instead of being answered.
    static func scheduleOnce() {
        DispatchQueue.main.async { runOnce() }
    }

    private static func runOnce() {
        let store = SessionStore()
        guard let snapshot = store.load() else { return }

        defer { try? FileManager.default.removeItem(at: store.fileURL) }
        guard snapshot.lines.contains(where: { !$0.text.isEmpty }) else { return }

        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let url = directory.appendingPathComponent("Recovered session.md")

        do {
            try MarkdownNote.text(for: snapshot).write(to: url, atomically: true, encoding: .utf8)
        } catch {
            return
        }

        let alert = NSAlert()
        alert.messageText = "Your previous note was saved as a file"
        alert.informativeText = """
            Notes are Markdown documents now. The note from the old single-session \
            storage is at \(url.path).
            """
        alert.addButton(withTitle: "Open It")
        alert.addButton(withTitle: "Later")
        if alert.runModal() == .alertFirstButtonReturn {
            NSDocumentController.shared.openDocument(withContentsOf: url, display: true) { _, _, _ in }
        }
    }
}
