import AppKit
import SwiftUI
import AikariviCore
import AikariviEditor

/// A capture-only host for the production window and editor. It never opens a
/// user's document or writes to the app's autosave directory.
@main
struct HeroCaptureApp: App {
    @StateObject private var capture = HeroCapture.shared

    var body: some Scene {
        Window(capture.title, id: "hero-capture") {
            ContentView(document: capture.document)
                .preferredColorScheme(.light)
                .onAppear { capture.start() }
        }
        .defaultSize(width: 900, height: 398)
    }
}

private struct FocusedDocumentKey: FocusedValueKey {
    typealias Value = TimedNoteDocument
}

extension FocusedValues {
    var timedNote: TimedNoteDocument? {
        get { self[FocusedDocumentKey.self] }
        set { self[FocusedDocumentKey.self] = newValue }
    }
}

@MainActor
final class HeroCapture: ObservableObject {
    static let shared = HeroCapture()
    let document = TimedNoteDocument()
    @Published var date = Date()

    private let fps = 30.0
    private let scenario: URL
    private let output: URL
    private var frameNumber = 0
    private var elapsedFrames = 0
    private var manifest = "ffconcat version 1.0\n"
    private var started = false

    var title: String { scenario.lastPathComponent }

    private init() {
        func argument(_ name: String) -> String {
            guard let index = CommandLine.arguments.firstIndex(of: name),
                  index + 1 < CommandLine.arguments.count
            else { fatalError("Missing \(name)") }
            return CommandLine.arguments[index + 1]
        }
        scenario = URL(fileURLWithPath: argument("--scenario"))
        output = URL(fileURLWithPath: argument("--output"))
    }

    func start() {
        guard !started else { return }
        started = true
        NSApp.setActivationPolicy(.regular)
        NSApp.appearance = NSAppearance(named: .aqua)
        print("Bring the Aikarivi capture window to the front to begin.")
        fflush(stdout)

        // Capture only after the window is active, so native controls have the
        // same appearance as the real app. No screen recording is used.
        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { timer in
            MainActor.assumeIsolated {
                guard NSApp.isActive,
                      self.document.editor.editorView.window?.isKeyWindow == true
                else { return }
                timer.invalidate()
                Task {
                    do {
                        try await self.record()
                        NSApp.terminate(nil)
                    } catch {
                        fputs("Hero capture failed: \(error)\n", stderr)
                        exit(1)
                    }
                }
            }
        }
    }

    private func record() async throws {
        let source = try String(contentsOf: scenario, encoding: .utf8)
        let snapshot = MarkdownNote.snapshot(from: source)
        let editor = document.editor
        guard let window = editor.editorView.window,
              let frameView = window.contentView?.superview
        else { throw CaptureError.noWindow }

        let frames = output.appendingPathComponent("frames", isDirectory: true)
        try FileManager.default.createDirectory(at: frames, withIntermediateDirectories: true)
        window.title = title
        window.setFrame(NSRect(x: 100, y: 200, width: 900, height: 450), display: true)
        editor.format = snapshot.format
        editor.stampMode = snapshot.stampMode
        editor.textView.isContinuousSpellCheckingEnabled = false
        editor.textView.isGrammarCheckingEnabled = false
        editor.textView.insertionPointColor = .clear
        editor.focus()

        // Use TextKit's actual insertion rect, with a deterministic blink.
        // Native cursor blinking otherwise depends on rendering wall time.
        let caret = CaptureCaret(frame: frameView.bounds)
        caret.autoresizingMask = [.width, .height]
        frameView.addSubview(caret, positioned: .above, relativeTo: nil)
        defer { caret.removeFromSuperview() }

        var completed: [NoteSnapshot.Line] = []
        for (lineIndex, line) in snapshot.lines.enumerated() {
            guard let wallClock = line.stamp?.wallClock else { throw CaptureError.missingClock }
            date = wallClock

            // Load a real Markdown-compatible line with its stored timestamp
            // before typing. Production Aikarivi normally stamps the first
            // character; this deliberate preview pause makes the stamp clear.
            editor.load(lines: completed + [NoteSnapshot.Line(text: "", stamp: line.stamp)])
            try await captureFrame(frameView, caret: caret, snapshot: snapshot,
                                   hold: lineIndex == 0 ? 21 : 9)

            for (index, character) in line.text.enumerated() {
                editor.textView.insertText(String(character), replacementRange: editor.textView.selectedRange())
                date = wallClock.addingTimeInterval(Double(index + 1) / 9)
                let hold = ",;:—".contains(character) ? 3 : 1
                try await captureFrame(frameView, caret: caret, snapshot: snapshot, hold: hold)
            }
            completed.append(line)
            guard editor.lines() == completed else { throw CaptureError.textMismatch }
            try await captureFrame(frameView, caret: caret, snapshot: snapshot, hold: 9)
            try await captureFrame(frameView, caret: caret, snapshot: snapshot, hold: 6, showsCaret: false)
            print("Captured line \(lineIndex + 1) of \(snapshot.lines.count)")
            fflush(stdout)
        }

        // A complete note stays visible for three seconds before the loop.
        for index in 0..<6 {
            try await captureFrame(frameView, caret: caret, snapshot: snapshot,
                                   hold: 15, showsCaret: index.isMultiple(of: 2))
        }
        let poster = frames.appendingPathComponent(String(format: "frame-%04d.png", frameNumber - 2))
        let posterData = try Data(contentsOf: poster)
        try posterData.write(to: output.appendingPathComponent("day-timelapse-poster.png"))
        // The concat demuxer needs the last file repeated to retain its duration.
        manifest += String(format: "file 'frames/frame-%04d.png'\noption framerate 30\n", frameNumber - 1)
        try manifest.write(to: output.appendingPathComponent("frames.ffconcat"), atomically: true, encoding: .utf8)
        let duration = Double(elapsedFrames) / fps
        try "\(duration)\n".write(to: output.appendingPathComponent("duration.txt"), atomically: true, encoding: .utf8)
        print("Finished: \(frameNumber) native frames, \(String(format: "%.1f", duration)) seconds.")
        fflush(stdout)
    }

    private func captureFrame(_ frameView: NSView, caret: CaptureCaret,
                              snapshot: NoteSnapshot, hold: Int,
                              showsCaret: Bool = true) async throws {
        while !NSApp.isActive || frameView.window?.isKeyWindow != true {
            guard frameView.window?.isVisible == true else { throw CaptureError.noWindow }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        // Yield to SwiftUI so the toolbar time and status line catch up with
        // the actual NSTextView edit before the bitmap is rendered.
        try await Task.sleep(nanoseconds: 35_000_000)
        frameView.layoutSubtreeIfNeeded()
        let editor = document.editor
        let screenRect = editor.textView.firstRect(forCharacterRange: editor.textView.selectedRange(), actualRange: nil)
        if let window = frameView.window {
            caret.insertionRect = frameView.convert(window.convertFromScreen(screenRect), from: nil)
        }
        caret.showsCaret = showsCaret
        frameView.displayIfNeeded()

        // Explicit Retina resolution makes output independent of the monitor.
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1800, pixelsHigh: 900,
                                         bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                         isPlanar: false, colorSpaceName: .deviceRGB,
                                         bytesPerRow: 0, bitsPerPixel: 0)
        else { throw CaptureError.noBitmap }
        rep.size = frameView.bounds.size
        frameView.cacheDisplay(in: frameView.bounds, to: rep)
        guard let data = rep.representation(using: .png, properties: [:]) else { throw CaptureError.noBitmap }
        let name = String(format: "frames/frame-%04d", frameNumber)
        try data.write(to: output.appendingPathComponent(name + ".png"))

        var current = snapshot
        current.lines = editor.lines()
        try MarkdownNote.text(for: current).write(to: output.appendingPathComponent(name + ".md"),
                                                 atomically: true, encoding: .utf8)
        manifest += "file '\(name).png'\noption framerate 30\nduration \(Double(hold) / fps)\n"
        frameNumber += 1
        elapsedFrames += hold
    }

    private enum CaptureError: Error {
        case noWindow, noBitmap, missingClock, textMismatch
    }
}

@MainActor
private final class CaptureCaret: NSView {
    var insertionRect = NSRect.zero { didSet { needsDisplay = true } }
    var showsCaret = true { didSet { needsDisplay = true } }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func draw(_ dirtyRect: NSRect) {
        guard showsCaret else { return }
        NSColor.systemBlue.setFill()
        var rect = insertionRect
        rect.size.width = 1.5
        NSBezierPath(roundedRect: rect, xRadius: 0.75, yRadius: 0.75).fill()
    }
}
