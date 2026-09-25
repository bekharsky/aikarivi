import XCTest
@testable import AikariviCore

final class StampFormatterTests: XCTestCase {
    func testFullClockFormat() {
        XCTAssertEqual(StampFormatter.string(for: 3600, format: .clock), "01:00:00")
        XCTAssertEqual(StampFormatter.string(for: 3599.9, format: .clock), "00:59:59")
    }

    func testDisabledUnitsRollIntoTheNextOne() {
        let minutesOnly = StampFormat.minutesOnly
        XCTAssertEqual(StampFormatter.string(for: 3600, format: minutesOnly), "60")
        XCTAssertEqual(StampFormatter.string(for: 3599, format: minutesOnly), "59")

        let secondsOnly = StampFormat(hours: false, minutes: false, seconds: true)
        XCTAssertEqual(StampFormatter.string(for: 90, format: secondsOnly), "90")

        let minutesAndSeconds = StampFormat(hours: false, minutes: true, seconds: true)
        XCTAssertEqual(StampFormatter.string(for: 3661, format: minutesAndSeconds), "61:01")
    }

    func testTruncationNeverShowsTimeTheTimerHasNotReached() {
        XCTAssertEqual(StampFormatter.string(for: 59.99, format: .clock), "00:00:59")
        XCTAssertEqual(StampFormatter.string(for: 59.99, format: .minutesOnly), "00")
    }

    func testSubsecondsAppendTenths() {
        XCTAssertEqual(StampFormatter.string(for: 62.47, format: .exact), "00:01:02.4")
    }

    func testSubsecondsRequireSeconds() {
        let format = StampFormat(hours: false, minutes: true, seconds: false, subseconds: true)
        XCTAssertEqual(StampFormatter.string(for: 125, format: format), "02")
    }

    func testOvertimeIsSigned() {
        XCTAssertEqual(StampFormatter.string(for: -12.5, format: .clock), "-00:00:12")
    }

    func testEmptyFormatRendersNothing() {
        let format = StampFormat(hours: false, minutes: false, seconds: false)
        XCTAssertTrue(format.isEmpty)
        XCTAssertEqual(StampFormatter.string(for: 100, format: format), "")
        XCTAssertEqual(StampFormatter.placeholder(for: format), "")
    }

    func testPlaceholderMatchesShape() {
        XCTAssertEqual(StampFormatter.placeholder(for: .clock), "--:--:--")
        XCTAssertEqual(StampFormatter.placeholder(for: .minutesOnly), "--")
        XCTAssertEqual(StampFormatter.placeholder(for: .exact), "--:--:--.-")
    }

    /// Detail level is only a rendering choice: the stored value stays intact.
    func testChangingDetailIsLossless() {
        let stamp = LineStamp(remaining: 2718.394, wallClock: Date())
        let remaining = stamp.remaining ?? 0
        XCTAssertEqual(StampFormatter.string(for: remaining, format: .minutesOnly), "45")
        XCTAssertEqual(StampFormatter.string(for: remaining, format: .clock), "00:45:18")
        XCTAssertEqual(StampFormatter.string(for: remaining, format: .exact), "00:45:18.3")
    }

    func testClockStringUsesTimeOfDayNotDuration() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        let date = Date(timeIntervalSince1970: 14 * 3600 + 32 * 60 + 5.4)

        XCTAssertEqual(
            StampFormatter.clockString(for: date, format: .clock, calendar: calendar),
            "14:32:05"
        )
        XCTAssertEqual(
            StampFormatter.clockString(
                for: date,
                format: StampFormat(hours: false, minutes: true, seconds: true),
                calendar: calendar
            ),
            "32:05",
            "hours of the clock must not roll into minutes"
        )
        XCTAssertEqual(
            StampFormatter.string(
                for: LineStamp(remaining: 3600, wallClock: date, kind: .clock),
                format: .clock
            ),
            StampFormatter.clockString(for: date, format: .clock)
        )
    }

    /// A stamp is shown as what it was made with, both halves or not.
    func testAStampIsShownAsTheKindItWasMadeWith() {
        let date = Date(timeIntervalSince1970: 14 * 3600 + 32 * 60 + 5)
        let bothHalves = LineStamp(remaining: 2718.394, wallClock: date, kind: .countdown)

        XCTAssertEqual(StampFormatter.string(for: bothHalves, format: .clock), "00:45:18")

        var journalled = bothHalves
        journalled.kind = .clock
        XCTAssertEqual(
            StampFormatter.string(for: journalled, format: .clock),
            StampFormatter.clockString(for: date, format: .clock)
        )
    }
}
