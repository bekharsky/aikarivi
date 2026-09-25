import SwiftUI

/// SwiftUI wrapper around the gutter-plus-text container. The controller outlives
/// view updates, so there is nothing to reconfigure here.
public struct NoteEditorView: NSViewRepresentable {
    private let controller: NoteEditorController

    public init(controller: NoteEditorController) {
        self.controller = controller
    }

    public func makeNSView(context: Context) -> NSView {
        controller.editorView
    }

    public func updateNSView(_ nsView: NSView, context: Context) {}
}
