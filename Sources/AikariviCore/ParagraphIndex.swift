import Foundation

/// Paragraph ranges of the note text, excluding the trailing newline of each.
///
/// A note with N hard breaks always has N + 1 paragraphs, including a final empty
/// one after a trailing newline — that empty line is where the writer is about to
/// type, so it needs a stamp like any other. Soft breaks stay inside a paragraph
/// and therefore keep its stamp.
public struct ParagraphIndex: Equatable {
    /// Breaks a line visually without starting a new paragraph (U+2028).
    public static let softLineBreak: Character = "\u{2028}"

    public private(set) var ranges: [NSRange]

    public init(text: String = "") {
        ranges = Self.compute(text)
    }

    public var count: Int { ranges.count }

    public mutating func update(text: String) {
        ranges = Self.compute(text)
    }

    public func range(forLine index: Int) -> NSRange {
        guard ranges.indices.contains(index) else { return NSRange(location: 0, length: 0) }
        return ranges[index]
    }

    public func index(forCharacterAt offset: Int) -> Int {
        var low = 0
        var high = ranges.count - 1
        while low < high {
            let middle = (low + high) / 2
            let range = ranges[middle]
            if offset < range.location {
                high = middle - 1
            } else if offset > range.location + range.length {
                low = middle + 1
            } else {
                return middle
            }
        }
        return max(0, min(low, ranges.count - 1))
    }

    /// Line indices touched by a character range, for drawing or bookkeeping.
    public func indexRange(intersecting characterRange: NSRange) -> Range<Int> {
        let first = index(forCharacterAt: characterRange.location)
        let last = index(forCharacterAt: NSMaxRange(characterRange))
        return first..<min(count, max(first, last) + 1)
    }

    /// Counts only hard breaks, the ones that create paragraphs. Soft breaks are
    /// deliberately ignored here and in `compute`, or the two would disagree.
    public static func lineBreakCount(in string: String) -> Int {
        var count = 0
        enumerateHardBreaks(in: string as NSString) { _, _ in count += 1 }
        return count
    }

    /// The same split as `compute`, but on a loose string — used to tell what
    /// text an edit puts on each paragraph it creates.
    public static func paragraphs(in string: String) -> [String] {
        let text = string as NSString
        var parts: [String] = []
        var start = 0

        enumerateHardBreaks(in: text) { breakStart, nextStart in
            parts.append(text.substring(with: NSRange(location: start, length: breakStart - start)))
            start = nextStart
        }

        parts.append(text.substring(from: start))
        return parts
    }

    private static func compute(_ string: String) -> [NSRange] {
        let text = string as NSString
        var ranges: [NSRange] = []
        var start = 0

        enumerateHardBreaks(in: text) { breakStart, nextStart in
            ranges.append(NSRange(location: start, length: breakStart - start))
            start = nextStart
        }

        ranges.append(NSRange(location: start, length: text.length - start))
        return ranges
    }

    /// Walks line feeds and carriage returns, treating CRLF as one break.
    private static func enumerateHardBreaks(in text: NSString, body: (Int, Int) -> Void) {
        var index = 0
        while index < text.length {
            let character = text.character(at: index)
            if character == 0x0A || character == 0x0D {
                var nextStart = index + 1
                if character == 0x0D, nextStart < text.length, text.character(at: nextStart) == 0x0A {
                    nextStart += 1
                }
                body(index, nextStart)
                index = nextStart
            } else {
                index += 1
            }
        }
    }
}
