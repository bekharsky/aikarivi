// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "Aikarivi",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "Aikarivi", targets: ["Aikarivi"])
    ],
    targets: [
        // Timer, stamps and their bookkeeping. No UI, fully testable.
        .target(
            name: "AikariviCore",
            path: "Sources/AikariviCore"
        ),
        // The AppKit text editor with the timestamp gutter.
        .target(
            name: "AikariviEditor",
            dependencies: ["AikariviCore"],
            path: "Sources/AikariviEditor"
        ),
        .executableTarget(
            name: "Aikarivi",
            dependencies: ["AikariviCore", "AikariviEditor"],
            path: "Sources/Aikarivi"
        ),
        .testTarget(
            name: "AikariviCoreTests",
            dependencies: ["AikariviCore"],
            path: "Tests/AikariviCoreTests"
        ),
        .testTarget(
            name: "AikariviEditorTests",
            dependencies: ["AikariviEditor"],
            path: "Tests/AikariviEditorTests"
        )
    ]
)
