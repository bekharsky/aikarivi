import AppKit
import TimedNotesCore

/// Text view that separates the two kinds of line break.
///
/// Return ends a line and starts a new, freshly stamped one. Command-Return
/// breaks the line visually but stays inside the same paragraph, so it keeps the
/// stamp it already has — room for wrapped, richer lines later on.
final class TimedTextView: NSTextView {
    /// The document handles the distinction between opening a dropped file
    /// and appending it to an existing note. Keeping the hook here means a
    /// drop over the actual editor is not swallowed by NSTextView's default
    /// text-import behavior.
    var onFileDrop: ((URL) -> Void)?

    override init(frame frameRect: NSRect, textContainer: NSTextContainer?) {
        super.init(frame: frameRect, textContainer: textContainer)
        registerForDraggedTypes([.fileURL])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        canReadDroppedFile(sender) ? .copy : []
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        guard canReadDroppedFile(sender),
              let item = sender.draggingPasteboard.readObjects(
                  forClasses: [NSURL.self],
                  options: [.urlReadingFileURLsOnly: true]
              )?.first as? NSURL
        else { return false }

        onFileDrop?(item as URL)
        return true
    }

    private func canReadDroppedFile(_ sender: NSDraggingInfo) -> Bool {
        sender.draggingPasteboard.canReadObject(
            forClasses: [NSURL.self],
            options: [.urlReadingFileURLsOnly: true]
        )
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let isReturn = event.keyCode == 36 || event.keyCode == 76
        if flags == .command, isReturn {
            insertSoftLineBreak()
            return true
        }
        return super.performKeyEquivalent(with: event)
    }

    /// Also reachable as the standard Insert Line Break action (⌥⏎).
    override func insertLineBreak(_ sender: Any?) {
        insertSoftLineBreak()
    }

    func insertSoftLineBreak() {
        guard isEditable else { return }
        insertText(String(ParagraphIndex.softLineBreak), replacementRange: selectedRange())
    }
}
