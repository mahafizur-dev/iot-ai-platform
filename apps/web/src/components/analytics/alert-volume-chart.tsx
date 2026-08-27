"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AlertsAnalytics, AnalyticsRange } from "@iot-ai-platform/shared-types";
import { formatBucketTick } from "@/lib/analytics";

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

/** Same colours the severity badges use, so the chart and the tables agree. */
const SEVERITY_COLOR: Record<string, string> = {
  critical: "hsl(var(--destructive))",
  warning: "hsl(var(--warning))",
  info: "hsl(var(--chart-1))",
};

export function AlertsOverTimeChart({
  byDay,
  range,
}: {
  byDay: AlertsAnalytics["byDay"];
  range: AnalyticsRange;
}) {
  if (byDay.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No alerts triggered in this window.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={byDay} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(value: string) => formatBucketTick(value, range)}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          labelFormatter={(label) => new Date(String(label)).toLocaleString()}
          formatter={(value) => [String(value), "alerts"]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeverityBreakdownChart({ bySeverity }: { bySeverity: AlertsAnalytics["bySeverity"] }) {
  if (bySeverity.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Nothing to break down.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={bySeverity}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="severity"
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          formatter={(value) => [String(value), "alerts"]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {bySeverity.map((entry) => (
            <Cell
              key={entry.severity}
              fill={SEVERITY_COLOR[entry.severity] ?? "hsl(var(--chart-4))"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
