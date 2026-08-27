"use client";

import { useEffect, useState } from "react";
import type { HealthStatus } from "@iot-ai-platform/shared-types";
import { fetchHealth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; health: HealthStatus };

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

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
    <Card data-testid="api-status-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">API status</CardTitle>
      </CardHeader>

      <CardContent>
        {state.kind === "loading" && (
          <p className="text-sm text-muted-foreground" role="status">
            Checking API…
          </p>
        )}

        {state.kind === "error" && (
          <p className="text-sm text-destructive" role="alert">
            Could not reach the API: {state.message}
          </p>
        )}

        {state.kind === "ready" && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-lg font-semibold text-success">
              <span aria-hidden className="inline-block size-2 rounded-full bg-success" />
              {state.health.status}
            </p>
            <p className="text-xs text-muted-foreground">
              up {formatUptime(state.health.uptimeSeconds)} · checked{" "}
              {new Date(state.health.timestamp).toLocaleTimeString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
