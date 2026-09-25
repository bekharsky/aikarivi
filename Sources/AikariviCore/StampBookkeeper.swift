import Foundation

/// Keeps line stamps aligned with the note text across arbitrary edits.
///
/// This is the whole trick of the app, kept free of AppKit so it can be tested:
/// the text stays plain, and every paragraph has a stamp beside it. The editor
/// calls `prepareEdit` while the old text is still in place, then `commitEdit`
/// once the change went through.
public struct StampBookkeeper {
    public private(set) var table: LineStampTable
    public private(set) var paragraphs: ParagraphIndex

    public init() {
        table = LineStampTable()
        paragraphs = ParagraphIndex()
    }

    public init(lines: [NoteSnapshot.Line]) {
        let lines = lines.isEmpty ? [NoteSnapshot.Line(text: "", stamp: nil)] : lines
        table = LineStampTable(stamps: lines.map(\.stamp))
        paragraphs = ParagraphIndex(text: lines.map(\.text).joined(separator: "\n"))
        table.ensureCount(paragraphs.count, filler: nil)
    }

    public var lineCount: Int { paragraphs.count }

    public func stamp(forLine index: Int) -> LineStamp? {
        table.stamp(forLine: index)
    }

    public func lines(in text: String) -> [NoteSnapshot.Line] {
        let text = text as NSString
        return paragraphs.ranges.enumerated().map { index, range in
            let safeRange = NSRange(
                location: min(range.location, text.length),
                length: min(range.length, max(0, text.length - min(range.location, text.length)))
            )
            return NoteSnapshot.Line(text: text.substring(with: safeRange), stamp: table.stamp(forLine: index))
        }
    }

    /// Lines overlapping a selection, with the boundary lines cut down to what
    /// is actually selected. Each keeps its own stamp.
    public func lines(in text: String, clippedTo selection: NSRange) -> [NoteSnapshot.Line] {
        guard selection.length > 0 else { return [] }

        let text = text as NSString
        var result: [NoteSnapshot.Line] = []

        for index in paragraphs.indexRange(intersecting: selection) {
            let paragraph = paragraphs.range(forLine: index)
            let start = max(paragraph.location, selection.location)
            let end = min(NSMaxRange(paragraph), NSMaxRange(selection))
            guard start <= end, end <= text.length else { continue }

            if start == end {
                // Only an empty line genuinely inside the selection counts; a
                // selection ending at a line boundary must not pull it in.
                guard paragraph.length == 0, paragraph.location < NSMaxRange(selection) else { continue }
            }

            result.append(
                NoteSnapshot.Line(
                    text: text.substring(with: NSRange(location: start, length: end - start)),
                    stamp: table.stamp(forLine: index)
                )
            )
        }

        return result
    }

    public mutating func prepareEdit(
        currentText: String,
        affectedRange: NSRange,
        replacement: String,
        stamp: LineStamp?
    ) {
        let text = currentText as NSString
        let clampedLocation = min(affectedRange.location, text.length)
        let clampedRange = NSRange(
            location: clampedLocation,
            length: min(affectedRange.length, text.length - clampedLocation)
        )
        let startLine = paragraphs.index(forCharacterAt: clampedRange.location)

        table.applyEdit(
            startLine: startLine,
            removedLineBreaks: ParagraphIndex.lineBreakCount(in: text.substring(with: clampedRange)),
            insertedStamps: stampsForLinesCreated(
                by: replacement,
                endingWith: remainderOfLine(after: clampedRange, in: text),
                stamp: stamp
            )
        )

        // An empty line gets its stamp from the first thing written on it. That
        // is how a line the writer opened with Return, and only later filled in,
        // gets the time it was actually written. A line that already holds text
        // keeps whatever it has, so anything written before the timer stays
        // unstamped no matter how much it is edited afterwards.
        //
        // A replacement that starts with a line break writes nothing here: it
        // pushes the empty line down and leaves it as blank as it was.
        let writtenHere = ParagraphIndex.paragraphs(in: replacement).first ?? ""
        if !writtenHere.isEmpty,
           table.stamp(forLine: startLine) == nil,
           paragraphs.range(forLine: startLine).length == 0,
           let stamp {
            table.setStamp(stamp, forLine: startLine)
        }
    }

    public mutating func commitEdit(newText: String) {
        paragraphs.update(text: newText)
        table.ensureCount(paragraphs.count, filler: nil)
    }

    public mutating func reset(lines: [NoteSnapshot.Line]) {
        self = StampBookkeeper(lines: lines)
    }

    /// A line created by an edit is stamped only when the edit puts text on it.
    /// Pressing Return leaves an empty line behind, and that line waits for its
    /// first character before taking a time — writers break the line long before
    /// they know what goes on it.
    private func stampsForLinesCreated(
        by replacement: String,
        endingWith remainder: String,
        stamp: LineStamp?
    ) -> [LineStamp?] {
        let parts = ParagraphIndex.paragraphs(in: replacement)
        guard parts.count > 1 else { return [] }

        return parts.dropFirst().enumerated().map { offset, part in
            let isLast = offset == parts.count - 2
            let content = isLast ? part + remainder : part
            return content.isEmpty ? nil : stamp
        }
    }

    /// What is left of the edited paragraph behind the replaced range. It slides
    /// onto the last line the edit creates, so that line counts as written.
    private func remainderOfLine(after range: NSRange, in text: NSString) -> String {
        let start = NSMaxRange(range)
        let paragraph = paragraphs.range(forLine: paragraphs.index(forCharacterAt: start))
        let end = min(NSMaxRange(paragraph), text.length)
        guard start <= end else { return "" }
        return text.substring(with: NSRange(location: start, length: end - start))
    }
}
