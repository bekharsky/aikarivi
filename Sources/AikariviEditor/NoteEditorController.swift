import AppKit
import Combine
import AikariviCore

/// Owns the TextKit stack and drives `StampBookkeeper` from the text view.
///
/// The note text stays plain: stamps live beside it and are drawn in the gutter.
/// That is what makes the detail level reversible — nothing about a line is lost
/// when hours or seconds are switched off.
@MainActor
public final class NoteEditorController: NSObject, ObservableObject, NSTextViewDelegate {
    public let textView: NSTextView

    /// The view to hand to SwiftUI: gutter and scrolling text side by side.
    public var editorView: NSView { containerView }

    @Published public var format: StampFormat = .clock {
        didSet {
            guard format != oldValue else { return }
            refreshGutter(resize: true)
        }
    }

    /// What the next line will be stamped with. Lines already written keep the
    /// kind they were given, so this only ever changes what is coming.
    @Published public var stampMode: StampMode = .countdown {
        didSet {
            guard stampMode != oldValue else { return }
            refreshGutter(resize: true)
        }
    }

    @Published public private(set) var caretLine = 0
    @Published public private(set) var caretStamp: LineStamp?
    @Published public private(set) var lineCount = 1

    /// Called after every edit so the session can be autosaved.
    public var onChange: (() -> Void)?

    public weak var timer: TimerEngine? {
        didSet { refreshGutter(resize: true) }
    }

    /// The document's undo manager. Routing edits through it is what marks the
    /// document as needing a save.
    public weak var hostUndoManager: UndoManager?

    /// Called when a text file is dropped directly onto the editor surface.
    /// The document decides whether that opens a new note or appends here.
    public var onFileDrop: ((URL) -> Void)? {
        didSet { timedTextView.onFileDrop = onFileDrop }
    }

    let scrollView = NSScrollView()
    let gutter = StampGutterView()

    private let containerView: NoteEditorContainerView
    private let storage = NSTextStorage()
    private let layoutManager = NSLayoutManager()
    private let textContainer = NSTextContainer()
    private let timedTextView: TimedTextView

    private let ownUndoManager = UndoManager()
    private var bookkeeper = StampBookkeeper()
    private var isLoading = false

    public override init() {
        textContainer.widthTracksTextView = true
        textContainer.size = NSSize(width: 400, height: CGFloat.greatestFiniteMagnitude)
        storage.addLayoutManager(layoutManager)
        layoutManager.addTextContainer(textContainer)

        timedTextView = TimedTextView(
            frame: NSRect(x: 0, y: 0, width: 400, height: 400),
            textContainer: textContainer
        )
        textView = timedTextView
        containerView = NoteEditorContainerView(gutter: gutter, scrollView: scrollView)

        super.init()

        textView.isRichText = false
        textView.allowsUndo = true
        textView.font = .systemFont(ofSize: 14)
        textView.textContainerInset = NSSize(width: 6, height: 12)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.delegate = self

        scrollView.documentView = textView
        scrollView.hasVerticalScroller = true
        scrollView.drawsBackground = true
        scrollView.borderType = .noBorder

        gutter.controller = self

        // The gutter has to follow the text while scrolling and rewrapping.
        scrollView.contentView.postsBoundsChangedNotifications = true
        textView.postsFrameChangedNotifications = true
        for name in [NSView.boundsDidChangeNotification, NSView.frameDidChangeNotification] {
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(redrawGutter),
                name: name,
                object: name == NSView.boundsDidChangeNotification ? scrollView.contentView : textView
            )
        }

        refreshGutter(resize: true)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    public func focus() {
        textView.window?.makeFirstResponder(textView)
    }

    // MARK: - Session

    public func lines() -> [NoteSnapshot.Line] {
        bookkeeper.lines(in: storage.string)
    }

    public func load(lines: [NoteSnapshot.Line]) {
        guard !lines.isEmpty else { return }

        isLoading = true
        textView.string = lines.map(\.text).joined(separator: "\n")
        bookkeeper.reset(lines: lines)
        isLoading = false

        textView.undoManager?.removeAllActions()
        textView.setSelectedRange(NSRange(location: storage.length, length: 0))
        refreshGutter(resize: true)
        updateCaretState()
    }

    /// Appends plain text dropped into an existing note. Going through the
    /// text view keeps the normal edit, undo, and timestamp paths intact.
    public func appendText(_ text: String) {
        let normalized = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        guard !normalized.isEmpty else { return }

        let separator = storage.string.isEmpty || storage.string.hasSuffix("\n") ? "" : "\n"
        let insertion = separator + normalized
        let end = NSRange(location: storage.length, length: 0)
        textView.insertText(insertion, replacementRange: end)
        textView.scrollRangeToVisible(NSRange(location: storage.length, length: 0))
        focus()
    }

    /// Text with the stamps put back in front of each line. Falls back to the
    /// whole note when nothing is selected.
    public func stampedText(selectionOnly: Bool) -> String {
        let selected = selectionOnly
            ? bookkeeper.lines(in: storage.string, clippedTo: textView.selectedRange())
            : []
        let lines = selected.isEmpty ? self.lines() : selected
        return NoteExporter.plainText(lines: lines, format: format)
    }

    public func refreshGutter(resize: Bool) {
        if resize {
            let sample = StampFormatter.widestSample(
                duration: timer?.duration ?? 3600,
                format: format
            )
            if gutter.updateWidth(sample: sample) {
                containerView.needsLayout = true
            }
        }
        gutter.setWaiting(waitingLine != nil)
        gutter.needsDisplay = true
    }

    // MARK: - Gutter data

    var paragraphCount: Int { bookkeeper.lineCount }

    func stampText(forLine index: Int) -> String {
        guard !format.isEmpty else { return "" }
        guard let stamp = bookkeeper.stamp(forLine: index) else {
            // An empty line has not been written on yet. The one the caret sits
            // on shows a placeholder to say a stamp is coming; any other blank
            // line is just spacing, and dashes there would be noise.
            let isEmpty = bookkeeper.paragraphs.range(forLine: index).length == 0
            if isEmpty, index != waitingLine {
                return ""
            }
            return StampFormatter.placeholder(for: format)
        }
        return StampFormatter.string(for: stamp, format: format)
    }

    /// Whether the gutter is showing dashes rather than a time. A placeholder
    /// carries no information, so it is drawn quieter than a real stamp.
    func showsPlaceholder(forLine index: Int) -> Bool {
        bookkeeper.stamp(forLine: index) == nil
    }

    /// The empty line the caret is on, when the next character typed there will
    /// take a stamp. Return leaves one behind; the gutter blinks its separators
    /// so the wait is visible. ⌘Return never creates one — it stays inside the
    /// paragraph it broke, under the stamp that line already has.
    var waitingLine: Int? {
        guard willStampNewLines,
              bookkeeper.stamp(forLine: caretLine) == nil,
              bookkeeper.paragraphs.range(forLine: caretLine).length == 0
        else { return nil }
        return caretLine
    }

    /// Whether a line started right now would get a time at all.
    private var willStampNewLines: Bool {
        switch stampMode {
        case .clock: return true
        case .countdown: return timer?.phase.isActive ?? false
        }
    }

    func lineIndexRange(intersecting characterRange: NSRange) -> Range<Int> {
        bookkeeper.paragraphs.indexRange(intersecting: characterRange)
    }

    /// Vertical position of a paragraph's first line fragment, in text view
    /// coordinates. A wrapped or soft-broken paragraph keeps one stamp, at its top.
    func firstLineFragmentRect(forLine index: Int) -> NSRect {
        let range = bookkeeper.paragraphs.range(forLine: index)
        let fallbackHeight = layoutManager.defaultLineHeight(for: textView.font ?? .systemFont(ofSize: 14))

        if storage.length == 0 || range.location >= storage.length {
            let extra = layoutManager.extraLineFragmentRect
            if extra != .zero {
                return extra
            }
            if storage.length == 0 {
                return NSRect(x: 0, y: 0, width: 0, height: fallbackHeight)
            }
        }

        let characterIndex = min(range.location, max(0, storage.length - 1))
        let glyphIndex = layoutManager.glyphIndexForCharacter(at: characterIndex)
        let rect = layoutManager.lineFragmentRect(forGlyphAt: glyphIndex, effectiveRange: nil)
        return rect == .zero ? NSRect(x: 0, y: 0, width: 0, height: fallbackHeight) : rect
    }

    // MARK: - NSTextViewDelegate

    public func textView(
        _ textView: NSTextView,
        shouldChangeTextIn affectedCharRange: NSRange,
        replacementString: String?
    ) -> Bool {
        guard !isLoading, let replacementString else { return true }

        bookkeeper.prepareEdit(
            currentText: storage.string,
            affectedRange: affectedCharRange,
            replacement: replacementString,
            stamp: stampForWriting()
        )
        return true
    }

    public func textDidChange(_ notification: Notification) {
        guard !isLoading else { return }

        bookkeeper.commitEdit(newText: storage.string)
        refreshGutter(resize: false)
        updateCaretState()
        onChange?()
    }

    /// Never returns the text view's own manager: asking for it would call back
    /// into this method.
    public func undoManager(for view: NSTextView) -> UndoManager? {
        hostUndoManager ?? ownUndoManager
    }

    public func textViewDidChangeSelection(_ notification: Notification) {
        guard !isLoading else { return }
        updateCaretState()
        gutter.needsDisplay = true
    }

    // MARK: - Internals

    private func stampForWriting() -> LineStamp? {
        switch stampMode {
        case .countdown:
            return timer?.currentStamp()
        case .clock:
            if let timer {
                return timer.currentClockStamp()
            }
            return LineStamp(wallClock: Date())
        }
    }

    @objc private func redrawGutter() {
        gutter.needsDisplay = true
    }

    private func updateCaretState() {
        let index = bookkeeper.paragraphs.index(forCharacterAt: textView.selectedRange().location)
        caretLine = index
        caretStamp = bookkeeper.stamp(forLine: index)
        lineCount = bookkeeper.lineCount
        gutter.setWaiting(waitingLine != nil)
    }
}
