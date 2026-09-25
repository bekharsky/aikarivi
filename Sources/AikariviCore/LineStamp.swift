import Foundation

/// The moment a note line was started, kept at full precision.
///
/// A stamp knows which kind of time it was made with, and keeps it. Switching
/// the app between countdown and clock decides what the *next* line gets; it
/// never rewrites what is already written. A session where the writer changed
/// their mind mid-way stays a truthful record of that.
public struct LineStamp: Codable, Equatable {
    /// What this line was stamped with, and therefore how it is shown.
    public var kind: StampMode
    /// Seconds left on the timer when the line was started.
    /// Negative once the timer has run out and writing continues.
    /// `nil` when the line was written in clock mode with the timer idle.
    public var remaining: TimeInterval?
    /// Calendar time of the same moment, in the writer's local zone.
    public var wallClock: Date?

    /// Without an explicit kind, the stamp is whatever it has: notes and tests
    /// written before the two modes existed are all countdowns.
    public init(remaining: TimeInterval? = nil, wallClock: Date? = nil, kind: StampMode? = nil) {
        self.remaining = remaining
        self.wallClock = wallClock
        self.kind = kind ?? (remaining == nil ? .clock : .countdown)
    }

    enum CodingKeys: String, CodingKey {
        case kind, remaining, wallClock
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        remaining = try container.decodeIfPresent(TimeInterval.self, forKey: .remaining)
        wallClock = try container.decodeIfPresent(Date.self, forKey: .wallClock)
        kind = try container.decodeIfPresent(StampMode.self, forKey: .kind)
            ?? (remaining == nil ? .clock : .countdown)
    }
}
