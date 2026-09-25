import XCTest
@testable import AikariviCore

final class LineStampTableTests: XCTestCase {
    private func stamp(_ remaining: TimeInterval) -> LineStamp {
        LineStamp(remaining: remaining, wallClock: Date(timeIntervalSince1970: remaining))
    }

    func testACreatedLineTakesTheStampItIsGiven() {
        var table = LineStampTable()
        table.setStamp(stamp(3600), forLine: 0)

        // Enter pressed at the end of line 0.
        table.applyEdit(startLine: 0, removedLineBreaks: 0, insertedStamps: [stamp(3540)])

        XCTAssertEqual(table.lineCount, 2)
        XCTAssertEqual(table.stamp(forLine: 0), stamp(3600))
        XCTAssertEqual(table.stamp(forLine: 1), stamp(3540))
    }

    func testACreatedLineCanStartWithoutAStamp() {
        var table = LineStampTable()
        table.setStamp(stamp(3600), forLine: 0)

        table.applyEdit(startLine: 0, removedLineBreaks: 0, insertedStamps: [nil])

        XCTAssertEqual(table.stamps.map { $0.flatMap(\.remaining) }, [3600, nil])
    }

    func testEditingInsideALineKeepsItsStamp() {
        var table = LineStampTable()
        table.setStamp(stamp(3600), forLine: 0)

        table.applyEdit(startLine: 0, removedLineBreaks: 0, insertedStamps: [])

        XCTAssertEqual(table.stamp(forLine: 0), stamp(3600))
    }

    func testSplittingALineStampsOnlyTheTail() {
        var table = LineStampTable(stamps: [stamp(3600), stamp(3000)])

        // Enter pressed in the middle of line 0.
        table.applyEdit(startLine: 0, removedLineBreaks: 0, insertedStamps: [stamp(2000)])

        XCTAssertEqual(table.stamps.map { $0.flatMap(\.remaining) }, [3600, 2000, 3000])
    }

    func testDeletingALineBreakMergesStamps() {
        var table = LineStampTable(stamps: [stamp(3600), stamp(3000), stamp(2400)])

        // Backspace at the start of line 1 removes one line break.
        table.applyEdit(startLine: 0, removedLineBreaks: 1, insertedStamps: [])

        XCTAssertEqual(table.stamps.map { $0.flatMap(\.remaining) }, [3600, 2400])
    }

    func testPastingSeveralLinesStampsAllOfThem() {
        var table = LineStampTable(stamps: [stamp(3600)])

        table.applyEdit(
            startLine: 0,
            removedLineBreaks: 0,
            insertedStamps: [stamp(1800), stamp(1800), stamp(1800)]
        )

        XCTAssertEqual(table.stamps.map { $0.flatMap(\.remaining) }, [3600, 1800, 1800, 1800])
    }

    func testReplacingASelectionSpanningLines() {
        var table = LineStampTable(stamps: [stamp(3600), stamp(3000), stamp(2400), stamp(1200)])

        // Selection from line 0 through line 2 replaced by two lines of text.
        table.applyEdit(startLine: 0, removedLineBreaks: 2, insertedStamps: [stamp(600)])

        XCTAssertEqual(table.stamps.map { $0.flatMap(\.remaining) }, [3600, 600, 1200])
    }

    func testEnsureCountFixesDrift() {
        var table = LineStampTable(stamps: [stamp(3600), stamp(3000)])

        table.ensureCount(4, filler: stamp(100))
        XCTAssertEqual(table.stamps.map { $0.flatMap(\.remaining) }, [3600, 3000, 100, 100])

        table.ensureCount(1, filler: nil)
        XCTAssertEqual(table.stamps.map { $0.flatMap(\.remaining) }, [3600])
    }

    func testTableNeverBecomesEmpty() {
        var table = LineStampTable(stamps: [])
        XCTAssertEqual(table.lineCount, 1)

        table.ensureCount(0, filler: nil)
        XCTAssertEqual(table.lineCount, 1)
    }
}
