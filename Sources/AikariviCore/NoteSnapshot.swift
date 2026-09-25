import Foundation

/// Everything needed to reopen a session exactly as it was left.
public struct NoteSnapshot: Codable, Equatable {
    public struct Line: Codable, Equatable {
        public var text: String
        public var stamp: LineStamp?

        public init(text: String, stamp: LineStamp?) {
            self.text = text
            self.stamp = stamp
        }
    }

    public var version: Int
    public var duration: TimeInterval
    /// Time left when the session was saved, `nil` if the timer never started.
    public var heldRemaining: TimeInterval?
    public var format: StampFormat
    /// Countdown remaining vs time of day. Independent of `format`, which only
    /// chooses how many units of whichever kind are shown.
    public var stampMode: StampMode
    public var lines: [Line]

    public init(
        version: Int = 1,
        duration: TimeInterval,
        heldRemaining: TimeInterval?,
        format: StampFormat,
        stampMode: StampMode = .countdown,
        lines: [Line]
    ) {
        self.version = version
        self.duration = duration
        self.heldRemaining = heldRemaining
        self.format = format
        self.stampMode = stampMode
        self.lines = lines
    }

    enum CodingKeys: String, CodingKey {
        case version, duration, heldRemaining, format, stampMode, lines
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        duration = try container.decode(TimeInterval.self, forKey: .duration)
        heldRemaining = try container.decodeIfPresent(TimeInterval.self, forKey: .heldRemaining)
        format = try container.decode(StampFormat.self, forKey: .format)
        stampMode = try container.decodeIfPresent(StampMode.self, forKey: .stampMode) ?? .countdown
        lines = try container.decode([Line].self, forKey: .lines)
    }
}

public enum NoteExporter {
    /// Renders the note as plain text with the stamps put back in front of each
    /// line, right-aligned so the text column stays straight. Soft breaks become
    /// real newlines indented under that column, keeping one stamp per line.
    public static func plainText(lines: [NoteSnapshot.Line], format: StampFormat) -> String {
        let softBreak = String(ParagraphIndex.softLineBreak)

        guard !format.isEmpty else {
            return lines
                .map { $0.text.replacingOccurrences(of: softBreak, with: "\n") }
                .joined(separator: "\n")
        }

        // Exactly what the gutter shows, line for line: each stamp in its own
        // kind, at the detail on screen, and nothing at all beside a blank line
        // that was never written on.
        let stamps: [String?] = lines.map { line in
            if let stamp = line.stamp {
                return StampFormatter.string(for: stamp, format: format)
            }
            return line.text.isEmpty ? nil : StampFormatter.placeholder(for: format)
        }
        let width = stamps.compactMap { $0?.count }.max() ?? 0

        var output: [String] = []
        for (stamp, line) in zip(stamps, lines) {
            guard let stamp else {
                output.append("")
                continue
            }

            let padded = String(repeating: " ", count: width - stamp.count) + stamp
            let prefix = "[\(padded)] "
            let parts = line.text.components(separatedBy: softBreak)

            output.append(prefix + (parts.first ?? ""))
            let continuation = String(repeating: " ", count: prefix.count)
            output.append(contentsOf: parts.dropFirst().map { continuation + $0 })
        }
        return output.joined(separator: "\n")
    }
}

/// Autosaved single session in Application Support. One note, always where you
/// left it — no save dialogs in the writing path.
public struct SessionStore {
    public let fileURL: URL

    // The historical storage location must remain readable for session recovery.
    public init(directoryName: String = "TimedNotes", fileName: String = "session.json") {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let directory = base.appendingPathComponent(directoryName, isDirectory: true)
        fileURL = directory.appendingPathComponent(fileName, isDirectory: false)
    }

    public func load() -> NoteSnapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? decoder.decode(NoteSnapshot.self, from: data)
    }

    public func save(_ snapshot: NoteSnapshot) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try encoder.encode(snapshot)
        try data.write(to: fileURL, options: .atomic)
    }

    private var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
