import Foundation

/// Stamps kept in parallel with the editor's paragraphs: entry `i` belongs to
/// paragraph `i`. The text itself stays plain, so a stamp can never be typed
/// over or deleted by accident.
public struct LineStampTable: Equatable {
    public private(set) var stamps: [LineStamp?]

    public init(lineCount: Int = 1) {
        stamps = Array(repeating: nil, count: max(1, lineCount))
    }

    public init(stamps: [LineStamp?]) {
        self.stamps = stamps.isEmpty ? [nil] : stamps
    }

    public var lineCount: Int { stamps.count }

    public func stamp(forLine index: Int) -> LineStamp? {
        guard stamps.indices.contains(index) else { return nil }
        return stamps[index]
    }

    public mutating func setStamp(_ stamp: LineStamp?, forLine index: Int) {
        guard stamps.indices.contains(index) else { return }
        stamps[index] = stamp
    }

    /// Mirrors a text edit onto the stamp list.
    ///
    /// The paragraph the edit starts in keeps its own stamp — editing a line
    /// does not restamp it. Paragraphs that the edit swallows disappear, and the
    /// ones it creates take `insertedStamps`, one entry per new paragraph.
    public mutating func applyEdit(
        startLine: Int,
        removedLineBreaks: Int,
        insertedStamps: [LineStamp?]
    ) {
        let clampedStart = max(0, min(startLine, stamps.count - 1))
        let removalStart = min(clampedStart + 1, stamps.count)
        let removalEnd = min(removalStart + max(0, removedLineBreaks), stamps.count)
        stamps.replaceSubrange(removalStart..<removalEnd, with: insertedStamps)
    }

    /// Safety net against drift between the text and the stamp list.
    public mutating func ensureCount(_ count: Int, filler: LineStamp?) {
        let target = max(1, count)
        if stamps.count < target {
            stamps.append(contentsOf: Array(repeating: filler, count: target - stamps.count))
        } else if stamps.count > target {
            stamps.removeLast(stamps.count - target)
        }
    }
}
