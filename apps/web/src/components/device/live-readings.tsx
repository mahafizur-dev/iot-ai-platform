"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { TelemetryPoint } from "@iot-ai-platform/shared-types";
import type { AppSocket } from "@/lib/use-socket";
import { formatMetricValue, formatRelativeTime, humanizeMetric } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

/** How many live points to keep per metric for the sparkline. */
const SPARK_WINDOW = 30;

type ReadingsByMetric = Record<string, TelemetryPoint>;
type HistoryByMetric = Record<string, { ts: string; value: number }[]>;

function indexByMetric(points: TelemetryPoint[]): ReadingsByMetric {
  return Object.fromEntries(points.map((point) => [point.metric, point]));
}

function seedHistory(points: TelemetryPoint[]): HistoryByMetric {
  return Object.fromEntries(points.map((point) => [point.metric, [{ ts: point.ts, value: point.value }]]));
}

/**
 * Latest value per metric, seeded from REST and kept current by the socket.
 * The sparkline is built from what has arrived since the page opened — it is
 * deliberately not backfilled, so it reads as "activity right now"; the
 * History tab is where the stored series lives.
 */
export function LiveReadings({
  socket,
  deviceId,
  initialReadings,
}: {
  socket: AppSocket | null;
  deviceId: string;
  initialReadings: TelemetryPoint[];
}) {
  const [readings, setReadings] = useState<ReadingsByMetric>(() => indexByMetric(initialReadings));
  const [history, setHistory] = useState<HistoryByMetric>(() => seedHistory(initialReadings));

  useEffect(() => {
    setReadings(indexByMetric(initialReadings));
    setHistory(seedHistory(initialReadings));
  }, [initialReadings]);

  useEffect(() => {
    if (!socket) return;

    const onTelemetry = (event: { deviceId: string; reading: TelemetryPoint }) => {
      if (event.deviceId !== deviceId) return;

      setReadings((current) => ({ ...current, [event.reading.metric]: event.reading }));
      setHistory((current) => {
        const previous = current[event.reading.metric] ?? [];
        const next = [...previous, { ts: event.reading.ts, value: event.reading.value }];

        return {
          ...current,
          [event.reading.metric]: next.slice(-SPARK_WINDOW),
        };
      });
    };

    socket.on("telemetry:update", onTelemetry);
    return () => {
      socket.off("telemetry:update", onTelemetry);
    };
  }, [socket, deviceId]);

  const metrics = Object.keys(readings).sort();

  if (metrics.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No telemetry yet"
        description="Readings appear here as soon as the device publishes to its MQTT topic."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map((metric) => {
        const reading = readings[metric];
        if (!reading) return null;

        const series = history[metric] ?? [];

        return (
          <Card key={metric}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {humanizeMetric(metric)}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMetricValue(reading.value)}
                </p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(reading.ts)}</p>
              </div>

              <div className="h-10" aria-hidden>
                {series.length > 1 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--chart-1))"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
