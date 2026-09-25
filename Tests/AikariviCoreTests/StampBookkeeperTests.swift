import XCTest
@testable import AikariviCore

/// Drives the bookkeeper the same way the text view does: `prepareEdit` on the
/// old text, then `commitEdit` on the new one.
private struct EditorHarness {
    var text = ""
    var bookkeeper = StampBookkeeper()
    var caret = 0

    mutating func type(_ string: String, remaining: TimeInterval?) {
        replace(NSRange(location: caret, length: 0), with: string, remaining: remaining)
    }

    mutating func replace(_ range: NSRange, with string: String, remaining: TimeInterval?) {
        let stamp = remaining.map { LineStamp(remaining: $0, wallClock: Date(timeIntervalSince1970: $0)) }
        bookkeeper.prepareEdit(currentText: text, affectedRange: range, replacement: string, stamp: stamp)
        text = (text as NSString).replacingCharacters(in: range, with: string)
        bookkeeper.commitEdit(newText: text)
        caret = range.location + (string as NSString).length
    }

    var stamps: [TimeInterval?] {
        bookkeeper.table.stamps.map { $0.flatMap(\.remaining) }
    }

    var lineTexts: [String] {
        bookkeeper.lines(in: text).map(\.text)
    }
}

final class StampBookkeeperTests: XCTestCase {
    /// Return is not the start of a line — the first character is. Breaking the
    /// line early and thinking for a while must not backdate what follows.
    func testALineIsStampedWhenTheWritingStartsNotAtTheLineBreak() {
        var editor = EditorHarness()
        editor.type("first thought", remaining: 3600)
        editor.type("\n", remaining: 3570)
        XCTAssertEqual(editor.stamps, [3600, nil])

        editor.type("second thought", remaining: 3400)
        editor.type("\n", remaining: 3300)
        editor.type("third", remaining: 3000)

        XCTAssertEqual(editor.lineTexts, ["first thought", "second thought", "third"])
        XCTAssertEqual(editor.stamps, [3600, 3400, 3000])
    }

    func testKeepsTypingInsideALineOnTheOriginalStamp() {
        var editor = EditorHarness()
        editor.type("hello", remaining: 3600)
        editor.type("\n", remaining: 3000)
        editor.type("world", remaining: 2999)

        // Go back and extend the first line.
        editor.replace(NSRange(location: 5, length: 0), with: " there", remaining: 1000)

        XCTAssertEqual(editor.lineTexts, ["hello there", "world"])
        XCTAssertEqual(editor.stamps, [3600, 2999])
    }

    func testTextWrittenBeforeTheTimerStaysUnstamped() {
        var editor = EditorHarness()
        editor.type("draft before start", remaining: nil)
        XCTAssertEqual(editor.stamps, [nil])

        // The timer starts. Editing the old line must not backdate it.
        editor.replace(NSRange(location: 0, length: 5), with: "DRAFT", remaining: 3500)
        XCTAssertEqual(editor.stamps, [nil])

        // A line begun under the running timer does get a time.
        editor.replace(NSRange(location: (editor.text as NSString).length, length: 0), with: "\n", remaining: 3400)
        editor.type("now the timer is running", remaining: 3399)
        XCTAssertEqual(editor.stamps, [nil, 3399], "only lines written under the timer get stamps")
    }

    /// The first line of a fresh note is empty, so writing on it is where it
    /// begins — otherwise it could never be stamped at all.
    /// Return pressed twice leaves a blank line behind. Nothing was written on
    /// it, so it takes no time — even though the second Return was typed there.
    func testReturnOnAnEmptyLineDoesNotStampIt() {
        var editor = EditorHarness()
        editor.type("above", remaining: 3600)
        editor.type("\n", remaining: 3550)
        editor.type("\n", remaining: 3500)
        editor.type("below", remaining: 3400)

        XCTAssertEqual(editor.stamps, [3600, nil, 3400])
    }

    func testFirstWordOnAnEmptyLineStampsIt() {
        var editor = EditorHarness()
        editor.type("hello", remaining: 3600)

        XCTAssertEqual(editor.stamps, [3600])
    }

    func testTrailingNewlineLeavesAnEmptyLineWaitingForItsFirstWord() {
        var editor = EditorHarness()
        editor.type("done", remaining: 3600)
        editor.type("\n", remaining: 3540)

        XCTAssertEqual(editor.lineTexts, ["done", ""])
        XCTAssertEqual(editor.stamps, [3600, nil])

        editor.type("more", remaining: 3100)
        XCTAssertEqual(editor.stamps, [3600, 3100])
    }

    /// Blank lines used as spacing are never written on, so they stay blank in
    /// the gutter too.
    func testBlankLinesLeftBetweenParagraphsStayUnstamped() {
        var editor = EditorHarness()
        editor.type("above", remaining: 3600)
        editor.type("\n\n", remaining: 3500)
        editor.type("below", remaining: 3400)

        XCTAssertEqual(editor.lineTexts, ["above", "", "below"])
        XCTAssertEqual(editor.stamps, [3600, nil, 3400])
    }

    func testDeletingALineBreakMergesIntoTheEarlierLine() {
        var editor = EditorHarness()
        editor.type("one", remaining: 3600)
        editor.type("\n", remaining: 3000)
        editor.type("two", remaining: 2999)

        // Backspace over the line break.
        editor.replace(NSRange(location: 3, length: 1), with: "", remaining: 2000)

        XCTAssertEqual(editor.lineTexts, ["onetwo"])
        XCTAssertEqual(editor.stamps, [3600])
    }

    func testPastedBlockStampsEveryNewLine() {
        var editor = EditorHarness()
        editor.type("intro", remaining: 3600)
        editor.type("\n", remaining: 3590)
        editor.type("a\nb\nc", remaining: 3580)

        XCTAssertEqual(editor.lineTexts, ["intro", "a", "b", "c"])
        XCTAssertEqual(editor.stamps, [3600, 3580, 3580, 3580])
    }

    func testSplittingAnOldLineStampsOnlyTheNewTail() {
        var editor = EditorHarness()
        editor.type("head and tail", remaining: 3600)
        editor.replace(NSRange(location: 4, length: 0), with: "\n", remaining: 1200)

        XCTAssertEqual(editor.lineTexts, ["head", " and tail"])
        XCTAssertEqual(editor.stamps, [3600, 1200])
    }

    func testReplacingASelectionAcrossLines() {
        var editor = EditorHarness()
        editor.type("one", remaining: 3600)
        editor.type("\n", remaining: 3500)
        editor.type("two", remaining: 3499)
        editor.type("\n", remaining: 3400)
        editor.type("three", remaining: 3399)

        // Select from the middle of line 0 through the middle of line 2.
        editor.replace(NSRange(location: 2, length: 8), with: "X", remaining: 600)

        XCTAssertEqual(editor.lineTexts, ["onXree"])
        XCTAssertEqual(editor.stamps, [3600])
    }

    func testOvertimeStampsAreKept() {
        var editor = EditorHarness()
        editor.type("still going", remaining: 5)
        editor.type("\n", remaining: -12.5)
        editor.type("past the deadline", remaining: -13)

        XCTAssertEqual(editor.stamps, [5, -13])
        XCTAssertEqual(
            StampFormatter.string(for: editor.stamps[1] ?? 0, format: .clock),
            "-00:00:13"
        )
    }

    func testLineCountAlwaysMatchesTheStampCount() {
        var editor = EditorHarness()
        editor.type("a\nb\nc\n\nd", remaining: 3600)
        editor.replace(NSRange(location: 0, length: 8), with: "", remaining: 3000)
        editor.type("\n\n\n", remaining: 2000)

        XCTAssertEqual(editor.bookkeeper.lineCount, editor.bookkeeper.table.lineCount)
        XCTAssertEqual(editor.bookkeeper.lineCount, editor.lineTexts.count)
    }

    func testRoundTripThroughASnapshot() {
        var editor = EditorHarness()
        editor.type("one", remaining: 3600)
        editor.type("\n", remaining: 3400)
        editor.type("two", remaining: 3399)

        let lines = editor.bookkeeper.lines(in: editor.text)
        let restored = StampBookkeeper(lines: lines)

        XCTAssertEqual(restored.lineCount, 2)
        XCTAssertEqual(restored.stamp(forLine: 0).flatMap(\.remaining), 3600)
        XCTAssertEqual(restored.stamp(forLine: 1).flatMap(\.remaining), 3399)
        XCTAssertEqual(
            NoteExporter.plainText(lines: lines, format: .minutesOnly),
            "[60] one\n[56] two"
        )
    }
}
