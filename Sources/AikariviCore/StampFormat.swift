import Foundation

/// Units shown in the line prefix. Each unit toggles independently, which is
/// what the H / m / s toolbar buttons drive.
public struct StampFormat: Codable, Equatable {
    public var hours: Bool
    public var minutes: Bool
    public var seconds: Bool
    /// Tenths of a second. Only meaningful together with `seconds`.
    public var subseconds: Bool

    public init(hours: Bool = true, minutes: Bool = true, seconds: Bool = true, subseconds: Bool = false) {
        self.hours = hours
        self.minutes = minutes
        self.seconds = seconds
        self.subseconds = subseconds
    }

    /// Everything the stamp knows about itself.
    public static let exact = StampFormat(hours: true, minutes: true, seconds: true, subseconds: true)
    public static let clock = StampFormat(hours: true, minutes: true, seconds: true)
    public static let minutesOnly = StampFormat(hours: false, minutes: true, seconds: false)

    public var isEmpty: Bool { !hours && !minutes && !seconds }

    public var showsFraction: Bool { subseconds && seconds }
}

/// What the gutter shows, and what a new line is stamped with.
public enum StampMode: String, Codable, Equatable, CaseIterable {
    /// Time left on the countdown. New lines stamp only while the timer runs.
    case countdown
    /// Time of day. New lines stamp as soon as writing starts, timer or not.
    case clock
}

public enum StampFormatter {
    /// Renders a stamp as the kind of time it was made with. The app-wide mode
    /// has no say here: a line written against the countdown keeps showing the
    /// countdown even after the writer moves on to clock stamps.
    public static func string(for stamp: LineStamp, format: StampFormat) -> String {
        switch stamp.kind {
        case .countdown:
            guard let remaining = stamp.remaining else { return placeholder(for: format) }
            return string(for: remaining, format: format)
        case .clock:
            guard let wallClock = stamp.wallClock else { return placeholder(for: format) }
            return clockString(for: wallClock, format: format)
        }
    }

    /// Renders `remaining` using only the enabled units.
    ///
    /// A disabled larger unit rolls into the next enabled one: with hours off,
    /// an hour left reads as `60` minutes rather than `00`.
    public static func string(for remaining: TimeInterval, format: StampFormat) -> String {
        guard !format.isEmpty else { return "" }

        let sign = remaining < 0 ? "-" : ""
        var rest = abs(remaining)
        // Truncate to the smallest displayed unit so the countdown never shows
        // a value the timer has not reached yet.
        rest = format.showsFraction ? (rest * 10).rounded(.down) / 10 : rest.rounded(.down)

        var parts: [String] = []
        if format.hours {
            let value = (rest / 3600).rounded(.down)
            rest -= value * 3600
            parts.append(twoDigits(value))
        }
        if format.minutes {
            let value = (rest / 60).rounded(.down)
            rest -= value * 60
            parts.append(twoDigits(value))
        }
        if format.seconds {
            let value = rest.rounded(.down)
            rest -= value
            parts.append(twoDigits(value))
        }

        var text = sign + parts.joined(separator: ":")
        if format.showsFraction {
            text += String(format: ".%d", min(9, Int((rest * 10).rounded())))
        }
        return text
    }

    /// Time of day in the given calendar, using the same unit toggles as the
    /// countdown. Hours here are the clock's hours, not a duration: turning
    /// them off hides that column rather than rolling 14:32 into 872 minutes.
    public static func clockString(
        for date: Date,
        format: StampFormat,
        calendar: Calendar = .current
    ) -> String {
        guard !format.isEmpty else { return "" }

        let parts = calendar.dateComponents([.hour, .minute, .second, .nanosecond], from: date)
        var values: [String] = []
        if format.hours {
            values.append(twoDigits(Double(parts.hour ?? 0)))
        }
        if format.minutes {
            values.append(twoDigits(Double(parts.minute ?? 0)))
        }
        if format.seconds {
            values.append(twoDigits(Double(parts.second ?? 0)))
        }

        var text = values.joined(separator: ":")
        if format.showsFraction {
            let tenth = min(9, (parts.nanosecond ?? 0) / 100_000_000)
            text += ".\(tenth)"
        }
        return text
    }

    /// Same shape as a real stamp, for lines that have no value in the current
    /// mode — written before the timer, or opened from a file that only kept
    /// the other half of the stamp.
    public static func placeholder(for format: StampFormat) -> String {
        guard !format.isEmpty else { return "" }

        let unitCount = [format.hours, format.minutes, format.seconds].filter { $0 }.count
        var text = Array(repeating: "--", count: unitCount).joined(separator: ":")
        if format.showsFraction {
            text += ".-"
        }
        return text
    }

    /// Longest stamp the gutter may have to draw, used to size it. Both kinds
    /// are measured: one note can hold countdown and clock lines side by side,
    /// and the column must not resize when the writer switches.
    public static func widestSample(duration: TimeInterval, format: StampFormat) -> String {
        guard !format.isEmpty else { return "" }

        let candidates = [
            string(for: -abs(duration), format: format),
            clockString(for: wideClockDate, format: format, calendar: utcCalendar),
            placeholder(for: format)
        ]
        let widest = candidates.max { $0.count < $1.count } ?? ""
        return widest + "0"
    }

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? TimeZone.current
        return calendar
    }()

    private static let wideClockDate = Date(timeIntervalSince1970: 23 * 3600 + 59 * 60 + 59.9)

    private static func twoDigits(_ value: Double) -> String {
        String(format: "%02.0f", value)
    }
}
