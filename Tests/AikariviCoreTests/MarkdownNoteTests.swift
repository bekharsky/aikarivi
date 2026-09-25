import XCTest
@testable import AikariviCore

final class MarkdownNoteTests: XCTestCase {
    private func snapshot(
        lines: [NoteSnapshot.Line],
        duration: TimeInterval = 3600,
        heldRemaining: TimeInterval? = nil,
        format: StampFormat = .clock,
        stampMode: StampMode = .countdown
    ) -> NoteSnapshot {
        NoteSnapshot(
            duration: duration,
            heldRemaining: heldRemaining,
            format: format,
            stampMode: stampMode,
            lines: lines
        )
    }

    func testFileIsReadableMarkdown() {
        let text = MarkdownNote.text(
            for: snapshot(
                lines: [
                    NoteSnapshot.Line(text: "first thought", stamp: LineStamp(remaining: 3596.246)),
                    NoteSnapshot.Line(text: "written before the start", stamp: nil)
                ],
                heldRemaining: 3192.4,
                format: .minutesOnly
            )
        )

        XCTAssertEqual(
            text,
            """
            ---
            timer: 01:00:00
            remaining: 00:53:12.400
            detail: m
            ---

            [00:59:56.246] first thought
            written before the start

            """
        )

        let restored = MarkdownNote.snapshot(from: text)
        XCTAssertNil(restored.lines[1].stamp)
    }

    func testRoundTripKeepsMillisecondPrecision() {
        let original = snapshot(
            lines: [
                NoteSnapshot.Line(text: "one", stamp: LineStamp(remaining: 2718.394)),
                NoteSnapshot.Line(text: "two", stamp: LineStamp(remaining: 45.917)),
                NoteSnapshot.Line(text: "past the bell", stamp: LineStamp(remaining: -130.5))
            ],
            duration: 2700,
            heldRemaining: -131,
            format: .exact
        )

        let restored = MarkdownNote.snapshot(from: MarkdownNote.text(for: original))

        XCTAssertEqual(restored.duration, original.duration)
        XCTAssertEqual(restored.format, original.format)
        XCTAssertEqual(restored.heldRemaining ?? 0, -131, accuracy: 0.001)
        XCTAssertEqual(restored.lines.map(\.text), ["one", "two", "past the bell"])
        for (restoredLine, originalLine) in zip(restored.lines, original.lines) {
            XCTAssertEqual(
                restoredLine.stamp.flatMap(\.remaining) ?? 0,
                originalLine.stamp.flatMap(\.remaining) ?? 0,
                accuracy: 0.001
            )
        }
    }

    /// The detail level is still free to change after reopening, which is the
    /// whole reason stamps are written at full precision.
    func testReopenedStampsCanStillChangeDetail() {
        let text = MarkdownNote.text(
            for: snapshot(
                lines: [NoteSnapshot.Line(text: "note", stamp: LineStamp(remaining: 2718.394))],
                format: .minutesOnly
            )
        )
        let stamp = MarkdownNote.snapshot(from: text).lines[0].stamp

        XCTAssertEqual(StampFormatter.string(for: stamp.flatMap(\.remaining) ?? 0, format: .minutesOnly), "45")
        XCTAssertEqual(StampFormatter.string(for: stamp.flatMap(\.remaining) ?? 0, format: .exact), "00:45:18.3")
    }

    /// Units used to be written with a capital H. Those notes are on disk and
    /// must keep every unit they were saved with.
    func testDetailWrittenBeforeTheUnitsWentLowercaseStillReads() {
        let restored = MarkdownNote.snapshot(
            from: """
            ---
            timer: 01:00:00
            detail: H:m:s.1
            ---

            [00:59:56.246] first thought

            """
        )

        XCTAssertEqual(restored.format, .exact)
    }

    func testSoftBreaksSurviveTheRoundTrip() {
        let soft = String(ParagraphIndex.softLineBreak)
        let original = snapshot(
            lines: [NoteSnapshot.Line(text: "head\(soft)tail", stamp: LineStamp(remaining: 100))]
        )

        let text = MarkdownNote.text(for: original)
        XCTAssertTrue(text.contains("[00:01:40.000] head\n               tail"))

        let restored = MarkdownNote.snapshot(from: text)
        XCTAssertEqual(restored.lines.count, 1, "a soft break must not become a new line")
        XCTAssertEqual(restored.lines[0].text, "head\(soft)tail")
    }

    func testUnstampedSoftBreaksSurviveAsPlainText() {
        let soft = String(ParagraphIndex.softLineBreak)
        let original = snapshot(
            lines: [NoteSnapshot.Line(text: "before\(soft)after", stamp: nil)]
        )

        let text = MarkdownNote.text(for: original)
        XCTAssertFalse(text.contains("[--:--:--.---]"))

        let restored = MarkdownNote.snapshot(from: text)
        XCTAssertEqual(restored.lines.count, 1)
        XCTAssertEqual(restored.lines[0].text, "before\(soft)after")
        XCTAssertNil(restored.lines[0].stamp)
    }

    func testEmptyLinesKeepTheirStamps() {
        let original = snapshot(
            lines: [
                NoteSnapshot.Line(text: "text", stamp: LineStamp(remaining: 300)),
                NoteSnapshot.Line(text: "", stamp: LineStamp(remaining: 200))
            ]
        )

        let text = MarkdownNote.text(for: original)
        XCTAssertFalse(text.contains("] \n"), "no trailing spaces on empty lines")

        let restored = MarkdownNote.snapshot(from: text)
        XCTAssertEqual(restored.lines.map(\.text), ["text", ""])
        XCTAssertEqual(restored.lines[1].stamp.flatMap(\.remaining) ?? 0, 200, accuracy: 0.001)
    }

    func testPlainMarkdownWithoutStampsOpensAsUnstampedLines() {
        let restored = MarkdownNote.snapshot(from: "# Heading\n\nsome text\nmore text\n")

        XCTAssertEqual(restored.lines.map(\.text), ["# Heading", "", "some text", "more text"])
        XCTAssertTrue(restored.lines.allSatisfy { $0.stamp == nil })
    }

    func testFileWithoutFrontMatterFallsBackToDefaults() {
        let restored = MarkdownNote.snapshot(from: "[00:10:00.000] a note\n")

        XCTAssertEqual(restored.duration, 3600)
        XCTAssertNil(restored.heldRemaining)
        XCTAssertEqual(restored.format, .clock)
        XCTAssertEqual(restored.lines[0].stamp.flatMap(\.remaining) ?? 0, 600, accuracy: 0.001)
    }

    func testEmptyFileGivesOneEmptyLine() {
        let restored = MarkdownNote.snapshot(from: "")

        XCTAssertEqual(restored.lines.count, 1)
        XCTAssertEqual(restored.lines[0].text, "")
        XCTAssertNil(restored.lines[0].stamp)
    }

    func testDetailFieldRoundTrips() {
        for format in [StampFormat.exact, .clock, .minutesOnly, StampFormat(hours: false, minutes: false, seconds: false)] {
            let text = MarkdownNote.text(for: snapshot(lines: [NoteSnapshot.Line(text: "x", stamp: nil)], format: format))
            XCTAssertEqual(MarkdownNote.snapshot(from: text).format, format)
        }
    }

    func testSecondsNeverRoundUpIntoAFullMinute() {
        let text = MarkdownNote.text(
            for: snapshot(lines: [NoteSnapshot.Line(text: "x", stamp: LineStamp(remaining: 119.9996))])
        )
        XCTAssertTrue(text.contains("[00:02:00.000]"), "got: \(text)")
    }

    func testClockModeAndWallClockRoundTrip() {
        let date = Date(timeIntervalSince1970: 1_757_249_525.123)
        let original = snapshot(
            lines: [
                NoteSnapshot.Line(
                    text: "hello",
                    stamp: LineStamp(remaining: 100, wallClock: date, kind: .clock)
                ),
                NoteSnapshot.Line(text: "clock only", stamp: LineStamp(wallClock: date))
            ],
            stampMode: .clock
        )

        let text = MarkdownNote.text(for: original)
        XCTAssertTrue(text.contains("stamps: clock"))
        XCTAssertTrue(text.contains("[@ "), "a clock line leads with its clock. got: \(text)")

        let restored = MarkdownNote.snapshot(from: text)
        XCTAssertEqual(restored.stampMode, .clock)
        XCTAssertEqual(restored.lines[0].stamp?.kind, .clock)
        XCTAssertEqual(restored.lines[0].stamp.flatMap(\.remaining) ?? 0, 100, accuracy: 0.001)
        XCTAssertEqual(
            restored.lines[0].stamp?.wallClock?.timeIntervalSince1970 ?? 0,
            date.timeIntervalSince1970,
            accuracy: 0.001
        )
        XCTAssertEqual(restored.lines[1].stamp?.kind, .clock)
        XCTAssertNil(restored.lines[1].stamp.flatMap(\.remaining))
        XCTAssertEqual(
            restored.lines[1].stamp?.wallClock?.timeIntervalSince1970 ?? 0,
            date.timeIntervalSince1970,
            accuracy: 0.001
        )
    }

    /// One note, both kinds. Reopening has to bring each line back as itself.
    func testAMixedNoteKeepsEachLineInItsOwnKind() {
        let date = Date(timeIntervalSince1970: 1_757_249_525.123)
        let original = snapshot(
            lines: [
                NoteSnapshot.Line(
                    text: "timed",
                    stamp: LineStamp(remaining: 3600, wallClock: date, kind: .countdown)
                ),
                NoteSnapshot.Line(
                    text: "journalled",
                    stamp: LineStamp(remaining: 3000, wallClock: date, kind: .clock)
                )
            ],
            stampMode: .clock
        )

        let restored = MarkdownNote.snapshot(from: MarkdownNote.text(for: original))

        XCTAssertEqual(restored.lines.map(\.text), ["timed", "journalled"])
        XCTAssertEqual(restored.lines[0].stamp?.kind, .countdown)
        XCTAssertEqual(restored.lines[1].stamp?.kind, .clock)
        for line in restored.lines {
            XCTAssertNotNil(line.stamp?.remaining, "both halves survive either way round")
            XCTAssertNotNil(line.stamp?.wallClock)
        }
    }

    /// Notes written before the two modes existed are all countdowns.
    func testOlderStampsReadAsCountdowns() {
        let restored = MarkdownNote.snapshot(from: "[00:10:00.000] a note\n")

        XCTAssertEqual(restored.lines[0].stamp?.kind, .countdown)
    }

    func testJournalIsAnAliasForClockMode() {
        let restored = MarkdownNote.snapshot(
            from: """
            ---
            timer: 01:00:00
            stamps: journal
            ---

            [@ 2026-09-07T14:32:05.123] a line

            """
        )
        XCTAssertEqual(restored.stampMode, .clock)
        XCTAssertNotNil(restored.lines[0].stamp?.wallClock)
    }
}
