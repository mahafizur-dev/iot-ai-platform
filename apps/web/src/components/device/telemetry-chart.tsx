"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TelemetryAggregatePoint, TelemetryPoint } from "@iot-ai-platform/shared-types";
import { fetchTelemetryRange } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatMetricValue, humanizeMetric } from "@/lib/format";
import {
  isAggregated,
  RANGE_LABELS,
  resolveRangeQuery,
  TELEMETRY_RANGES,
  type TelemetryRange,
} from "@/lib/telemetry-range";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ChartPoint {
  ts: number;
  value: number;
}

function toChartPoints(
  rows: TelemetryPoint[] | TelemetryAggregatePoint[],
  aggregated: boolean,
): ChartPoint[] {
  if (aggregated) {
    return (rows as TelemetryAggregatePoint[]).map((row) => ({
      ts: new Date(row.bucket).getTime(),
      value: row.value,
    }));
  }

  return (rows as TelemetryPoint[]).map((row) => ({
    ts: new Date(row.ts).getTime(),
    value: row.value,
  }));
}

function formatTick(ts: number, range: TelemetryRange): string {
  const date = new Date(ts);

  return range === "1h" || range === "24h"
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Stored telemetry for one metric. Long ranges are served by the Timescale
 * continuous aggregates rather than raw rows — see `resolveRangeQuery` for
 * why that switch exists.
 */
export function TelemetryChart({ deviceId, metrics }: { deviceId: string; metrics: string[] }) {
  const { withAuth } = useAuth();

  const [metric, setMetric] = useState<string | null>(metrics[0] ?? null);
  const [range, setRange] = useState<TelemetryRange>("24h");
  const [points, setPoints] = useState<ChartPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Metrics arrive asynchronously with the latest-readings fetch; adopt the
    // first one once it does, but don't fight a choice the user has made.
    setMetric((current) => (current && metrics.includes(current) ? current : (metrics[0] ?? null)));
  }, [metrics]);

  useEffect(() => {
    if (!metric) return;

    let cancelled = false;
    setPoints(null);
    setError(null);

    const aggregated = isAggregated(range);

    withAuth((token) => fetchTelemetryRange(token, deviceId, resolveRangeQuery(range, metric)))
      .then((rows) => {
        if (!cancelled) setPoints(toChartPoints(rows, aggregated));
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load telemetry");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth, deviceId, metric, range]);

  const summary = useMemo(() => {
    if (!points || points.length === 0) return null;

    const values = points.map((point) => point.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((total, value) => total + value, 0) / values.length,
    };
  }, [points]);

  if (metrics.length === 0) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="Nothing to chart yet"
        description="Once this device reports a metric, its history shows up here."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>{metric ? humanizeMetric(metric) : "Telemetry"}</CardTitle>
            <CardDescription>
              {RANGE_LABELS[range]}
              {isAggregated(range) && " · hourly/daily averages"}
            </CardDescription>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Time range">
            {TELEMETRY_RANGES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={range === option}
                onClick={() => setRange(option)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  range === option
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {metrics.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Metric">
            {metrics.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={metric === option}
                onClick={() => setMetric(option)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  metric === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {humanizeMetric(option)}
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {points === null && !error ? (
          <Skeleton className="h-[260px] w-full" />
        ) : points && points.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No readings in {RANGE_LABELS[range].toLowerCase()}.
          </p>
        ) : (
          points && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value: number) => formatTick(value, range)}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  // Recharts types these as the widest possible React/value
                  // types; the data is ours, so narrow rather than declare.
                  labelFormatter={(label) => new Date(Number(label)).toLocaleString()}
                  formatter={(value) => [formatMetricValue(Number(value)), metric ?? "value"]}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                />
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
          )
        )}

        {summary && (
          <dl className="grid grid-cols-3 gap-4 border-t pt-4 text-sm">
            {(["min", "avg", "max"] as const).map((key) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{key}</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {formatMetricValue(summary[key])}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
