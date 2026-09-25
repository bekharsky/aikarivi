import AppKit
import SwiftUI
import XCTest
@testable import AikariviEditor
@testable import AikariviCore

/// Renders the editor offscreen. This is the part that cannot be checked by
/// reasoning alone: stamps and text only exist on screen, so the drawing has to
/// actually run.
@MainActor
final class GutterRenderTests: XCTestCase {
    private func makeController(lines: [NoteSnapshot.Line], format: StampFormat) -> NoteEditorController {
        let controller = NoteEditorController()
        controller.format = format
        controller.editorView.frame = NSRect(x: 0, y: 0, width: 480, height: 320)
        controller.load(lines: lines)
        controller.editorView.layoutSubtreeIfNeeded()
        return controller
    }

    private func sampleLines() -> [NoteSnapshot.Line] {
        [
            NoteSnapshot.Line(text: "first line", stamp: LineStamp(remaining: 3600)),
            NoteSnapshot.Line(text: "second line", stamp: LineStamp(remaining: 3212.4)),
            NoteSnapshot.Line(text: "third line", stamp: LineStamp(remaining: 45.9))
        ]
    }

    /// Pixels that differ from the background, i.e. drawn text.
    private func inkPixels(of view: NSView, dumpTo name: String? = nil) throws -> Int {
        XCTAssertGreaterThan(view.bounds.width, 0)

        let rep = try XCTUnwrap(view.bitmapImageRepForCachingDisplay(in: view.bounds))
        view.cacheDisplay(in: view.bounds, to: rep)

        if let name, let data = rep.representation(using: .png, properties: [:]) {
            try? data.write(to: URL(fileURLWithPath: "/tmp/timed-notes-\(name).png"))
        }

        let background = try XCTUnwrap(rep.colorAt(x: rep.pixelsWide - 2, y: rep.pixelsHigh - 2))
        var ink = 0
        for y in 0..<rep.pixelsHigh {
            for x in 0..<max(0, rep.pixelsWide - 3) {
                guard let color = rep.colorAt(x: x, y: y) else { continue }
                if abs(color.brightnessComponent - background.brightnessComponent) > 0.05 {
                    ink += 1
                }
            }
        }
        return ink
    }

    func testGutterDrawsStamps() throws {
        let controller = makeController(lines: sampleLines(), format: .clock)
        let ink = try inkPixels(of: controller.gutter, dumpTo: "clock")
        XCTAssertGreaterThan(ink, 100, "stamps should be visible in the gutter")
    }

    func testLessDetailDrawsLessInk() throws {
        let exact = try inkPixels(of: makeController(lines: sampleLines(), format: .exact).gutter, dumpTo: "exact")
        let minutes = try inkPixels(
            of: makeController(lines: sampleLines(), format: .minutesOnly).gutter,
            dumpTo: "minutes"
        )

        XCTAssertGreaterThan(minutes, 0)
        XCTAssertGreaterThan(exact, minutes, "H:mm:ss.t is wider than minutes only")
    }

    func testTurningEveryUnitOffLeavesNoGutter() throws {
        let format = StampFormat(hours: false, minutes: false, seconds: false)
        let controller = makeController(lines: sampleLines(), format: format)
        XCTAssertEqual(controller.gutter.preferredWidth, 0)
        XCTAssertEqual(controller.gutter.frame.width, 0)
    }

    func testGutterWidthFollowsTheFormat() {
        let exact = makeController(lines: sampleLines(), format: .exact)
        let minutes = makeController(lines: sampleLines(), format: .minutesOnly)
        XCTAssertGreaterThan(exact.gutter.preferredWidth, minutes.gutter.preferredWidth)
        XCTAssertGreaterThan(exact.gutter.frame.width, minutes.gutter.frame.width)
    }

    /// Switching detail back must bring the original precision back.
    func testDetailChangeIsReversible() throws {
        let controller = makeController(lines: sampleLines(), format: .exact)
        let before = try inkPixels(of: controller.gutter)

        controller.format = .minutesOnly
        controller.editorView.layoutSubtreeIfNeeded()
        let reduced = try inkPixels(of: controller.gutter)

        controller.format = .exact
        controller.editorView.layoutSubtreeIfNeeded()
        let restored = try inkPixels(of: controller.gutter)

        XCTAssertLessThan(reduced, before)
        XCTAssertEqual(restored, before)
    }

    func testStampTextUsesStoredPrecision() {
        let controller = makeController(lines: sampleLines(), format: .minutesOnly)
        XCTAssertEqual(controller.stampText(forLine: 1), "53")

        controller.format = .exact
        XCTAssertEqual(controller.stampText(forLine: 1), "00:53:32.4")
    }

    func testLinesWithoutStampsShowAPlaceholder() {
        let controller = makeController(
            lines: [NoteSnapshot.Line(text: "written before the timer", stamp: nil)],
            format: .clock
        )
        XCTAssertEqual(controller.stampText(forLine: 0), "--:--:--")
    }

    /// The bug that made the app unusable: the gutter drew, the text did not.
    func testTextAndGutterAreBothVisibleWhenHostedInSwiftUI() throws {
        let controller = NoteEditorController()
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 300),
            styleMask: [.titled, .resizable],
            backing: .buffered,
            defer: false
        )
        window.contentView = NSHostingView(rootView: NoteEditorView(controller: controller))
        window.makeKeyAndOrderFront(nil)
        controller.load(lines: sampleLines())
        window.contentView?.layoutSubtreeIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))

        let clipView = controller.scrollView.contentView
        XCTAssertEqual(clipView.bounds.origin.x, 0, "the text must not be scrolled out of view")
        XCTAssertGreaterThan(controller.scrollView.frame.minX, 0, "the text sits right of the gutter")
        XCTAssertEqual(
            controller.scrollView.frame.minX,
            controller.gutter.frame.width,
            accuracy: 0.5,
            "gutter and text must not overlap"
        )

        XCTAssertGreaterThan(try inkPixels(of: controller.textView, dumpTo: "hosted-text"), 200)
        XCTAssertGreaterThan(try inkPixels(of: controller.gutter, dumpTo: "hosted-gutter"), 100)
    }
}
