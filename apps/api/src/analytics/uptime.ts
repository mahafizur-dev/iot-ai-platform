export interface ConnectivityEvent {
  eventType: string;
  ts: Date;
}

export interface UptimeWindow {
  from: Date;
  to: Date;
}

export interface UptimeResult {
  /** Seconds the device was considered online inside the window. */
  onlineSeconds: number;
  windowSeconds: number;
  /** 0–1. Rounded to four places so callers can render a stable percentage. */
  ratio: number;
  disconnections: number;
}

/**
 * Uptime from the connectivity trail in `device_events`.
 *
 * The events are transitions, not samples, so the device's state between two
 * events is whatever the earlier one set — this walks the transitions and sums
 * the online spans clipped to the window.
 *
 * `statusAtWindowStart` matters because the trail almost never begins exactly
 * at `from`: a device that connected last week and has published nothing since
 * has no events inside a 24-hour window at all, yet was online for all of it.
 * Callers pass the state carried into the window (derived from the last event
 * before `from`, falling back to the device's current status when the trail
 * predates retention).
 */
export function calculateUptime(
  events: ConnectivityEvent[],
  window: UptimeWindow,
  statusAtWindowStart: "online" | "offline",
): UptimeResult {
  const windowStart = window.from.getTime();
  const windowEnd = window.to.getTime();
  const windowMs = Math.max(0, windowEnd - windowStart);

  if (windowMs === 0) {
    return { onlineSeconds: 0, windowSeconds: 0, ratio: 0, disconnections: 0 };
  }

  const transitions = events
    .filter((event) => event.eventType === "connected" || event.eventType === "disconnected")
    .map((event) => ({ online: event.eventType === "connected", at: event.ts.getTime() }))
    .filter((event) => event.at >= windowStart && event.at <= windowEnd)
    .sort((a, b) => a.at - b.at);

  let online = statusAtWindowStart === "online";
  let cursor = windowStart;
  let onlineMs = 0;
  let disconnections = 0;

  for (const transition of transitions) {
    // A repeated transition in the same direction is not a state change; it
    // must not double-count a disconnection or restart the span.
    if (transition.online === online) continue;

    if (online) {
      onlineMs += transition.at - cursor;
      disconnections += 1;
    }

    online = transition.online;
    cursor = transition.at;
  }

  if (online) {
    onlineMs += windowEnd - cursor;
  }

  const ratio = onlineMs / windowMs;

  return {
    onlineSeconds: Math.round(onlineMs / 1000),
    windowSeconds: Math.round(windowMs / 1000),
    ratio: Math.round(ratio * 10_000) / 10_000,
    disconnections,
  };
}
