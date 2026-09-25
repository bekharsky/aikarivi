import Combine
import Foundation

/// Countdown that keeps running past zero, because a thought started at -00:12
/// is still worth stamping.
@MainActor
public final class TimerEngine: ObservableObject {
    public enum Phase: Equatable {
        case idle
        case running
        case paused
        /// Ran out, still counting (remaining is negative).
        case overtime

        public var isActive: Bool { self == .running || self == .overtime }
    }

    @Published public private(set) var phase: Phase = .idle
    /// Ticked value for display. Line stamps use `exactRemaining` instead.
    @Published public private(set) var remaining: TimeInterval
    @Published public private(set) var duration: TimeInterval

    private var deadline: Date?
    private var heldRemaining: TimeInterval?
    private var ticker: AnyCancellable?

    public init(duration: TimeInterval = 3600) {
        self.duration = duration
        self.remaining = duration
    }

    /// Precise time left at this instant, or `nil` while idle.
    public var exactRemaining: TimeInterval? {
        switch phase {
        case .idle:
            return nil
        case .running, .overtime:
            return deadline?.timeIntervalSinceNow
        case .paused:
            return heldRemaining
        }
    }

    public func currentStamp() -> LineStamp? {
        guard let exactRemaining else { return nil }
        return LineStamp(remaining: exactRemaining, wallClock: Date(), kind: .countdown)
    }

    /// Time of day for a new line. The remaining time rides along when the timer
    /// happens to be running, but the line is a clock line and stays one.
    public func currentClockStamp() -> LineStamp {
        LineStamp(remaining: exactRemaining, wallClock: Date(), kind: .clock)
    }

    /// Changing the duration mid-session moves the deadline by the difference,
    /// so a running timer can be stretched without losing the stamps so far.
    public func setDuration(_ newValue: TimeInterval) {
        let clamped = max(1, newValue.rounded())
        let delta = clamped - duration
        duration = clamped

        switch phase {
        case .idle:
            remaining = duration
        case .running, .overtime:
            deadline = deadline?.addingTimeInterval(delta)
            tick()
        case .paused:
            let left = (heldRemaining ?? duration) + delta
            heldRemaining = left
            remaining = left
        }
    }

    public func start() {
        deadline = Date().addingTimeInterval(duration)
        heldRemaining = nil
        remaining = duration
        phase = .running
        startTicker()
    }

    public func pause() {
        guard phase.isActive else { return }
        let left = deadline?.timeIntervalSinceNow ?? remaining
        heldRemaining = left
        remaining = left
        deadline = nil
        phase = .paused
        stopTicker()
    }

    public func resume() {
        guard phase == .paused else { return }
        let left = heldRemaining ?? duration
        deadline = Date().addingTimeInterval(left)
        heldRemaining = nil
        remaining = left
        phase = left <= 0 ? .overtime : .running
        startTicker()
    }

    public func toggle() {
        switch phase {
        case .idle: start()
        case .running, .overtime: pause()
        case .paused: resume()
        }
    }

    public func reset() {
        stopTicker()
        deadline = nil
        heldRemaining = nil
        phase = .idle
        remaining = duration
    }

    /// Restores a saved session as paused: real time moved on while the app was
    /// closed, and silently swallowing it would corrupt every later stamp.
    public func restore(duration: TimeInterval, heldRemaining: TimeInterval?) {
        stopTicker()
        self.duration = max(1, duration)
        deadline = nil

        if let heldRemaining {
            self.heldRemaining = heldRemaining
            remaining = heldRemaining
            phase = .paused
        } else {
            self.heldRemaining = nil
            remaining = self.duration
            phase = .idle
        }
    }

    private func startTicker() {
        ticker = Timer.publish(every: 0.1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.tick() }
    }

    private func stopTicker() {
        ticker?.cancel()
        ticker = nil
    }

    private func tick() {
        guard let deadline else { return }
        remaining = deadline.timeIntervalSinceNow

        if remaining <= 0, phase == .running {
            phase = .overtime
        } else if remaining > 0, phase == .overtime {
            phase = .running
        }
    }
}
