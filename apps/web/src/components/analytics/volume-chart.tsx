"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsRange, TelemetryVolumePoint } from "@iot-ai-platform/shared-types";
import { formatBucketTick, formatCount } from "@/lib/analytics";

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

/** Readings stored per bucket — the "is data still flowing" chart. */
export function VolumeChart({
  points,
  range,
}: {
  points: TelemetryVolumePoint[];
  range: AnalyticsRange;
}) {
  if (points.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No telemetry stored in this window.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="volume-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(value: string) => formatBucketTick(value, range)}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis
          tickFormatter={(value: number) => formatCount(value)}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip
          labelFormatter={(label) => new Date(String(label)).toLocaleString()}
          formatter={(value) => [formatCount(Number(value)), "readings"]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Area
          type="monotone"
          dataKey="points"
          stroke="hsl(var(--chart-1))"
          strokeWidth={2}
          fill="url(#volume-fill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
