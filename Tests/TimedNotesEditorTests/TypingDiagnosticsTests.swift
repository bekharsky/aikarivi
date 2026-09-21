import AppKit
import XCTest
@testable import TimedNotesEditor
@testable import TimedNotesCore

/// Types into the real text view, the way the app does.
@MainActor
final class TypingTests: XCTestCase {
    /// The controller holds the timer weakly, like the app's model does, so the
    /// test has to own it.
    private var timer: TimerEngine?

    private func makeController() -> NoteEditorController {
        let controller = NoteEditorController()
        controller.editorView.frame = NSRect(x: 0, y: 0, width: 480, height: 320)
        controller.editorView.layoutSubtreeIfNeeded()
        return controller
    }

    private func timerRunning(on controller: NoteEditorController) -> TimerEngine {
        let timer = TimerEngine(duration: 3600)
        self.timer = timer
        controller.timer = timer
        timer.start()
        return timer
    }

    func testTypedTextLandsInTheEditorAndIsDrawn() throws {
        let controller = makeController()
        _ = timerRunning(on: controller)
        let textView = controller.textView

        textView.insertText("hello", replacementRange: NSRange(location: 0, length: 0))
        textView.insertNewline(nil)
        textView.insertText("world", replacementRange: textView.selectedRange())

        XCTAssertEqual(textView.string, "hello\nworld")
        XCTAssertEqual(controller.lineCount, 2)

        let rep = try XCTUnwrap(textView.bitmapImageRepForCachingDisplay(in: textView.bounds))
        textView.cacheDisplay(in: textView.bounds, to: rep)
        let background = try XCTUnwrap(rep.colorAt(x: rep.pixelsWide - 2, y: rep.pixelsHigh - 2))
        var ink = 0
        for y in 0..<rep.pixelsHigh {
            for x in 0..<rep.pixelsWide {
                guard let color = rep.colorAt(x: x, y: y) else { continue }
                if abs(color.brightnessComponent - background.brightnessComponent) > 0.05 {
                    ink += 1
                }
            }
        }
        XCTAssertGreaterThan(ink, 200, "typed text should be drawn")
    }

    func testDroppedTextAppendsAtTheEndOfTheNote() {
        let controller = makeController()
        controller.stampMode = .clock
        controller.textView.insertText("existing", replacementRange: NSRange(location: 0, length: 0))

        controller.appendText("dropped\ntext")

        XCTAssertEqual(controller.textView.string, "existing\ndropped\ntext")
        XCTAssertEqual(controller.lineCount, 3)
    }

    func testReturnStartsANewStampedLine() {
        let controller = makeController()
        _ = timerRunning(on: controller)
        let textView = controller.textView

        textView.insertText("first", replacementRange: NSRange(location: 0, length: 0))
        textView.insertNewline(nil)
        textView.insertText("second", replacementRange: textView.selectedRange())

        XCTAssertEqual(controller.lineCount, 2)
        XCTAssertNotEqual(controller.stampText(forLine: 0), "--:--:--")
        XCTAssertNotEqual(controller.stampText(forLine: 1), "--:--:--")
    }

    /// Return alone is not writing: the fresh line stays blank in the gutter
    /// until the first character lands on it.
    func testAFreshLineWaitsForItsFirstCharacterBeforeShowingATime() {
        let controller = makeController()
        _ = timerRunning(on: controller)
        let textView = controller.textView

        textView.insertText("first", replacementRange: NSRange(location: 0, length: 0))
        textView.insertNewline(nil)
        XCTAssertEqual(
            controller.stampText(forLine: 1),
            "--:--:--",
            "the fresh line shows it is waiting, not a time"
        )
        XCTAssertEqual(controller.waitingLine, 1)

        textView.insertText("second", replacementRange: textView.selectedRange())
        XCTAssertNil(controller.waitingLine, "the wait is over once something is written")
        XCTAssertNotEqual(controller.stampText(forLine: 1), "--:--:--")
    }

    /// Nothing is coming for this line, so nothing is promised.
    func testAnEmptyLineWaitsForNothingWhileTheTimerIsIdle() {
        let controller = makeController()
        let textView = controller.textView

        textView.insertText("first", replacementRange: NSRange(location: 0, length: 0))
        textView.insertNewline(nil)

        XCTAssertNil(controller.waitingLine)
        XCTAssertEqual(controller.stampText(forLine: 1), "")
    }

    /// Clock mode always has a time to give, timer or not.
    func testClockModeWaitsOnAFreshLineWithoutATimer() {
        let controller = makeController()
        controller.stampMode = .clock
        let textView = controller.textView

        textView.insertText("first", replacementRange: NSRange(location: 0, length: 0))
        textView.insertNewline(nil)

        XCTAssertEqual(controller.waitingLine, 1)
    }

    /// ⌘Return is the other half of the pair: it makes no line, so there is
    /// nothing to wait for.
    func testSoftBreakLeavesNoLineWaiting() throws {
        let controller = makeController()
        _ = timerRunning(on: controller)
        let textView = try XCTUnwrap(controller.textView as? TimedTextView)

        textView.insertText("first", replacementRange: NSRange(location: 0, length: 0))
        textView.insertSoftLineBreak()

        XCTAssertNil(controller.waitingLine)
        XCTAssertEqual(controller.lineCount, 1)
    }

    /// A blank line left between paragraphs is spacing, not a promise.
    func testOnlyTheCaretLineShowsThatItIsWaiting() {
        let controller = makeController()
        _ = timerRunning(on: controller)
        let textView = controller.textView

        textView.insertText("first", replacementRange: NSRange(location: 0, length: 0))
        textView.insertNewline(nil)
        textView.insertNewline(nil)
        textView.insertText("third", replacementRange: textView.selectedRange())
        textView.setSelectedRange(NSRange(location: 0, length: 0))

        XCTAssertEqual(controller.stampText(forLine: 1), "", "the blank line in the middle stays blank")
        XCTAssertNil(controller.waitingLine)
    }

    /// ⌘⏎ breaks the line but stays on the same stamp.
    func testCommandReturnKeepsTheLineAndItsStamp() throws {
        let controller = makeController()
        _ = timerRunning(on: controller)
        let textView = try XCTUnwrap(controller.textView as? TimedTextView)

        textView.insertText("one long thought", replacementRange: NSRange(location: 0, length: 0))
        let stampBefore = controller.stampText(forLine: 0)
        textView.insertSoftLineBreak()
        textView.insertText("continued below", replacementRange: textView.selectedRange())

        XCTAssertEqual(controller.lineCount, 1, "a soft break must not create a paragraph")
        XCTAssertEqual(controller.stampText(forLine: 0), stampBefore)
        XCTAssertTrue(textView.string.contains(ParagraphIndex.softLineBreak))
    }

    func testCommandReturnIsHandledAsAKeyEquivalent() throws {
        let controller = makeController()
        _ = timerRunning(on: controller)
        let textView = try XCTUnwrap(controller.textView as? TimedTextView)
        textView.insertText("line", replacementRange: NSRange(location: 0, length: 0))

        let event = try XCTUnwrap(
            NSEvent.keyEvent(
                with: .keyDown,
                location: .zero,
                modifierFlags: .command,
                timestamp: 0,
                windowNumber: 0,
                context: nil,
                characters: "\r",
                charactersIgnoringModifiers: "\r",
                isARepeat: false,
                keyCode: 36
            )
        )

        XCTAssertTrue(textView.performKeyEquivalent(with: event))
        XCTAssertEqual(controller.lineCount, 1)
        XCTAssertTrue(textView.string.hasSuffix(String(ParagraphIndex.softLineBreak)))
    }

    func testCopyingASelectionKeepsTheStampsOfTheSelectedLines() {
        let controller = makeController()
        controller.format = .minutesOnly
        controller.load(lines: [
            NoteSnapshot.Line(text: "first", stamp: LineStamp(remaining: 3600)),
            NoteSnapshot.Line(text: "second", stamp: LineStamp(remaining: 3000)),
            NoteSnapshot.Line(text: "third", stamp: LineStamp(remaining: 60))
        ])

        // Select the middle line only ("second" starts after "first\n").
        controller.textView.setSelectedRange(NSRange(location: 6, length: 6))
        XCTAssertEqual(controller.stampedText(selectionOnly: true), "[50] second")

        controller.textView.setSelectedRange(NSRange(location: 0, length: 0))
        XCTAssertEqual(
            controller.stampedText(selectionOnly: true),
            "[60] first\n[50] second\n[01] third",
            "no selection copies the whole note"
        )
    }

    /// Copying follows the toolbar, not the file: the millisecond precision kept
    /// on disk must never end up in the pasteboard.
    func testCopyFollowsTheDetailShownOnScreen() {
        let controller = makeController()
        controller.load(lines: [NoteSnapshot.Line(text: "note", stamp: LineStamp(remaining: 2718.394))])

        controller.format = .minutesOnly
        XCTAssertEqual(controller.stampedText(selectionOnly: false), "[45] note")

        controller.format = .clock
        XCTAssertEqual(controller.stampedText(selectionOnly: false), "[00:45:18] note")

        controller.format = .exact
        XCTAssertEqual(controller.stampedText(selectionOnly: false), "[00:45:18.3] note")

        controller.format = StampFormat(hours: false, minutes: false, seconds: false)
        XCTAssertEqual(controller.stampedText(selectionOnly: false), "note", "no units, no clutter")
    }

    /// Copying is a transcript of the gutter: the same kinds, the same detail,
    /// and nothing beside a line the gutter left blank.
    func testCopyShowsOnlyWhatTheGutterShows() {
        let controller = makeController()
        controller.format = .minutesOnly
        controller.load(lines: [
            NoteSnapshot.Line(text: "first", stamp: LineStamp(remaining: 3600)),
            NoteSnapshot.Line(text: "", stamp: nil),
            NoteSnapshot.Line(text: "before the timer", stamp: nil)
        ])

        XCTAssertEqual(controller.stampText(forLine: 1), "", "the blank line has an empty gutter")
        XCTAssertEqual(
            controller.stampedText(selectionOnly: false),
            "[60] first\n\n[--] before the timer"
        )
    }

    func testExportIndentsSoftBrokenLinesUnderTheStamp() throws {
        let controller = makeController()
        controller.format = .minutesOnly
        // A fixed stamp instead of a live timer: this is about the layout of the
        // exported text, not about the clock.
        controller.load(lines: [
            NoteSnapshot.Line(text: "head", stamp: LineStamp(remaining: 3600))
        ])

        let textView = try XCTUnwrap(controller.textView as? TimedTextView)
        textView.insertSoftLineBreak()
        textView.insertText("tail", replacementRange: textView.selectedRange())

        XCTAssertEqual(controller.stampedText(selectionOnly: false), "[60] head\n     tail")
    }

    func testClockModeStampsALineWithoutARunningTimer() {
        let controller = makeController()
        controller.stampMode = .clock
        controller.textView.insertText("hello", replacementRange: NSRange(location: 0, length: 0))

        XCTAssertNotEqual(controller.stampText(forLine: 0), "")
        XCTAssertNotEqual(controller.stampText(forLine: 0), StampFormatter.placeholder(for: .clock))
    }

    func testCountdownDoesNotStampUntilTheTimerStarts() {
        let controller = makeController()
        controller.stampMode = .countdown
        controller.textView.insertText("hello", replacementRange: NSRange(location: 0, length: 0))

        XCTAssertEqual(controller.stampText(forLine: 0), "--:--:--")
    }

    /// Each line is copied as the kind it was written in, whatever the toolbar
    /// says now.
    func testCopyKeepsEachLineInItsOwnKind() {
        let date = Date(timeIntervalSince1970: 14 * 3600 + 32 * 60)
        let controller = makeController()
        controller.format = .clock
        controller.load(lines: [
            NoteSnapshot.Line(
                text: "timed",
                stamp: LineStamp(remaining: 3600, wallClock: date, kind: .countdown)
            ),
            NoteSnapshot.Line(
                text: "journalled",
                stamp: LineStamp(remaining: 1800, wallClock: date, kind: .clock)
            )
        ])

        let onTheClock = StampFormatter.clockString(for: date, format: .clock)
        let expected = "[01:00:00] timed\n[\(onTheClock)] journalled"

        controller.stampMode = .countdown
        XCTAssertEqual(controller.stampedText(selectionOnly: false), expected)

        controller.stampMode = .clock
        XCTAssertEqual(
            controller.stampedText(selectionOnly: false),
            expected,
            "switching the mode must not restamp what is already written"
        )
    }

    /// The switch decides the next line and nothing else.
    func testSwitchingModeLeavesWrittenLinesAlone() {
        let controller = makeController()
        let timer = timerRunning(on: controller)
        let textView = controller.textView

        textView.insertText("under the timer", replacementRange: NSRange(location: 0, length: 0))
        let countdownStamp = controller.stampText(forLine: 0)

        controller.stampMode = .clock
        XCTAssertEqual(
            controller.stampText(forLine: 0),
            countdownStamp,
            "the first line was written against the timer and stays that way"
        )

        textView.insertNewline(nil)
        textView.insertText("after the switch", replacementRange: textView.selectedRange())

        let clockStamp = controller.stampText(forLine: 1)
        XCTAssertNotEqual(clockStamp, countdownStamp)
        XCTAssertEqual(
            clockStamp,
            StampFormatter.clockString(for: Date(), format: .clock),
            "the new line took the time of day"
        )
        XCTAssertEqual(timer.phase, .running, "the timer keeps running through the switch")
    }
}
