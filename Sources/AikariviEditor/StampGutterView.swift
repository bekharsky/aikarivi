import AppKit
import AikariviCore

/// Left gutter that prints each line's stamp.
///
/// A plain sibling view, not an `NSRulerView`: the ruler tiling machinery fights
/// with SwiftUI's sizing of the scroll view and ends up offsetting the clip view
/// so that the text is never shown.
final class StampGutterView: NSView {
    weak var controller: NoteEditorController?

    private(set) var preferredWidth: CGFloat = 56
    private let horizontalPadding: CGFloat = 8
    // Fully monospaced, not just the digits: the dashes and colons of a
    // placeholder have to line up with the numbers above and below them.
    // A point below the body text, because monospaced glyphs already read
    // smaller than the system font at the same size.
    private let font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)

    /// Half of the placeholder's blink, at the caret's own rate.
    private var blinkTimer: Timer?
    private var showsSeparators = true

    /// Flipped to share the text view's top-down coordinates.
    override var isFlipped: Bool { true }

    deinit {
        blinkTimer?.invalidate()
    }

    /// Runs the blink only while a line is actually waiting for its first
    /// character. Restarting it lit keeps a freshly opened line from appearing
    /// half-drawn.
    func setWaiting(_ waiting: Bool) {
        guard waiting else {
            guard blinkTimer != nil else { return }
            blinkTimer?.invalidate()
            blinkTimer = nil
            showsSeparators = true
            needsDisplay = true
            return
        }

        guard blinkTimer == nil else { return }
        showsSeparators = true
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.showsSeparators.toggle()
                self.needsDisplay = true
            }
        }
        // Common mode: the blink must not freeze while a menu is tracking.
        RunLoop.main.add(timer, forMode: .common)
        blinkTimer = timer
    }

    /// Sized to the widest stamp the current format can produce.
    func updateWidth(sample: String) -> Bool {
        guard !sample.isEmpty else {
            let changed = preferredWidth != 0
            preferredWidth = 0
            return changed
        }

        let width = (sample as NSString).size(withAttributes: [.font: font]).width
        let candidate = max(24, ceil(width) + horizontalPadding * 2)
        guard abs(candidate - preferredWidth) > 0.5 else { return false }
        preferredWidth = candidate
        return true
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.textBackgroundColor.setFill()
        bounds.fill()

        guard bounds.width > 1 else { return }
        NSColor.separatorColor.setFill()
        NSRect(x: bounds.maxX - 1, y: 0, width: 1, height: bounds.height).fill()

        guard let controller,
              let layoutManager = controller.textView.layoutManager,
              let container = controller.textView.textContainer
        else { return }

        let textView = controller.textView
        let visibleRect = textView.visibleRect
        let glyphRange = layoutManager.glyphRange(forBoundingRect: visibleRect, in: container)
        let characterRange = layoutManager.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
        let inset = textView.textContainerInset.height

        for index in controller.lineIndexRange(intersecting: characterRange) {
            let stamp = controller.stampText(forLine: index)
            guard !stamp.isEmpty else { continue }

            let attributes: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: colour(forLine: index, in: controller)
            ]
            let lineRect = controller.firstLineFragmentRect(forLine: index)
            let size = (stamp as NSString).size(withAttributes: attributes)
            // Scrolling the text moves the stamps with it.
            let y = lineRect.minY + inset - visibleRect.origin.y + (lineRect.height - size.height) / 2
            let x = bounds.maxX - horizontalPadding - size.width

            guard y + size.height > dirtyRect.minY, y < dirtyRect.maxY else { continue }

            let waiting = index == controller.waitingLine
            if waiting, !showsSeparators {
                blinked(stamp, attributes: attributes).draw(at: NSPoint(x: x, y: y))
            } else {
                (stamp as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: attributes)
            }
        }
    }

    /// Times speak, dashes do not. A placeholder — including the blinking one on
    /// the line being waited for — stays at the faintest step, or it shouts over
    /// the writing it sits next to.
    private func colour(forLine index: Int, in controller: NoteEditorController) -> NSColor {
        if controller.showsPlaceholder(forLine: index) {
            return .quaternaryLabelColor
        }
        return index == controller.caretLine ? .secondaryLabelColor : .tertiaryLabelColor
    }

    /// The dark half of the blink: separators drop out, the dashes stay. Only
    /// the punctuation flickers, so the column keeps its width and the eye is
    /// not dragged across the page.
    private func blinked(
        _ stamp: String,
        attributes: [NSAttributedString.Key: Any]
    ) -> NSAttributedString {
        let text = NSMutableAttributedString(string: stamp, attributes: attributes)
        let characters = stamp as NSString
        for offset in 0..<characters.length {
            let character = characters.character(at: offset)
            guard character == 0x3A || character == 0x2E else { continue }
            text.addAttribute(
                .foregroundColor,
                value: NSColor.clear,
                range: NSRange(location: offset, length: 1)
            )
        }
        return text
    }
}

/// Lays the gutter out beside the text, replacing the scroll view's ruler.
final class NoteEditorContainerView: NSView {
    let gutter: StampGutterView
    let scrollView: NSScrollView

    init(gutter: StampGutterView, scrollView: NSScrollView) {
        self.gutter = gutter
        self.scrollView = scrollView
        super.init(frame: NSRect(x: 0, y: 0, width: 480, height: 320))
        addSubview(gutter)
        addSubview(scrollView)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layout() {
        super.layout()
        let width = min(gutter.preferredWidth, max(0, bounds.width / 3))
        gutter.frame = NSRect(x: 0, y: 0, width: width, height: bounds.height)
        scrollView.frame = NSRect(x: width, y: 0, width: bounds.width - width, height: bounds.height)
    }
}
