"use client";

import { useEffect, useState } from "react";
import type { HealthStatus } from "@iot-ai-platform/shared-types";
import { fetchHealth } from "@/lib/api-client";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; health: HealthStatus };

export function ApiStatusCard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchHealth()
      .then((health) => {
        if (!cancelled) setState({ kind: "ready", health });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="api-status-card"
    >
      <h2 className="text-sm font-medium text-slate-500">API status</h2>

      {state.kind === "loading" && (
        <p className="mt-2 text-slate-600" role="status">
          Checking API…
        </p>
      )}

      {state.kind === "error" && (
        <p className="mt-2 text-red-600" role="alert">
          Could not reach the API: {state.message}
        </p>
      )}

      {state.kind === "ready" && (
        <div className="mt-2">
          <p className="flex items-center gap-2 text-emerald-600">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {state.health.status}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            uptime: {state.health.uptimeSeconds}s · checked at{" "}
            {new Date(state.health.timestamp).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}
