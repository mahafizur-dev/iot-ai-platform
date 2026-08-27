"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, BellRing, Cpu, Gauge, Timer } from "lucide-react";
import {
  ANALYTICS_RANGES,
  type AlertsAnalytics,
  type AnalyticsOverview,
  type AnalyticsRange,
  type EventsReport,
  type TelemetryVolumePoint,
  type UptimeReport,
} from "@iot-ai-platform/shared-types";
import {
  fetchAlertsAnalytics,
  fetchAnalyticsOverview,
  fetchEventsReport,
  fetchTelemetryVolume,
  fetchUptimeReport,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  formatCount,
  formatDuration,
  formatPercent,
  RANGE_LABELS,
  uptimeVariant,
} from "@/lib/analytics";
import { humanizeMetric } from "@/lib/format";
import { RequireAuth } from "@/components/RequireAuth";
import { FilterToggle } from "@/components/filter-toggle";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { VolumeChart } from "@/components/analytics/volume-chart";
import {
  AlertsOverTimeChart,
  SeverityBreakdownChart,
} from "@/components/analytics/alert-volume-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AnalyticsData {
  overview: AnalyticsOverview;
  volume: TelemetryVolumePoint[];
  uptime: UptimeReport;
  events: EventsReport;
  alerts: AlertsAnalytics;
}

function ChartCard({
  title,
  description,
  loading,
  children,
  className,
}: {
  title: string;
  description?: string;
  loading: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{loading ? <Skeleton className="h-[240px] w-full" /> : children}</CardContent>
    </Card>
  );
}

function AnalyticsScreen() {
  const { withAuth } = useAuth();

  const [range, setRange] = useState<AnalyticsRange>("24h");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    // One state object rather than five, so the whole page swaps atomically
    // when the range changes instead of tearing chart by chart.
    Promise.all([
      withAuth((token) => fetchAnalyticsOverview(token, range)),
      withAuth((token) => fetchTelemetryVolume(token, range)),
      withAuth((token) => fetchUptimeReport(token, range)),
      withAuth((token) => fetchEventsReport(token, range)),
      withAuth((token) => fetchAlertsAnalytics(token, range)),
    ])
      .then(([overview, volume, uptime, events, alerts]) => {
        if (!cancelled) setData({ overview, volume, uptime, events, alerts });
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load analytics");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth, range]);

  const loading = data === null;
  const worstDevices = [...(data?.uptime.devices ?? [])]
    .sort((a, b) => a.uptimeRatio - b.uptimeRatio)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rollups over stored telemetry, connectivity, and alerts.
          </p>
        </div>

        <FilterToggle
          options={ANALYTICS_RANGES}
          value={range}
          onChange={setRange}
          label="Time range"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Readings stored"
          value={formatCount(data?.overview.telemetry.points ?? 0)}
          hint={`${data?.overview.telemetry.reportingStreams ?? 0} reporting streams`}
          icon={Activity}
          loading={loading}
        />
        <StatCard
          label="Fleet uptime"
          value={formatPercent(data?.uptime.fleetUptimeRatio ?? null)}
          hint={RANGE_LABELS[range].toLowerCase()}
          icon={Gauge}
          accent={
            data && data.uptime.fleetUptimeRatio !== null && data.uptime.fleetUptimeRatio < 0.95
              ? "destructive"
              : "success"
          }
          loading={loading}
        />
        <StatCard
          label="Alerts triggered"
          value={data?.overview.alerts.triggered ?? 0}
          hint={`${data?.overview.alerts.resolved ?? 0} resolved`}
          icon={BellRing}
          accent={data?.overview.alerts.triggered ? "warning" : undefined}
          loading={loading}
        />
        <StatCard
          label="Mean time to resolve"
          value={formatDuration(data?.overview.alerts.meanTimeToResolveSeconds ?? null)}
          hint={`ack in ${formatDuration(data?.overview.alerts.meanTimeToAcknowledgeSeconds ?? null)}`}
          icon={Timer}
          loading={loading}
        />
      </div>

      <ChartCard
        title="Telemetry volume"
        description={`Readings stored per ${range === "24h" ? "hour" : "day"}, from the Timescale rollups`}
        loading={loading}
      >
        {data && <VolumeChart points={data.volume} range={range} />}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Alerts over time" loading={loading}>
          {data && <AlertsOverTimeChart byDay={data.alerts.byDay} range={range} />}
        </ChartCard>

        <ChartCard title="By severity" loading={loading}>
          {data && <SeverityBreakdownChart bySeverity={data.alerts.bySeverity} />}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Least reliable devices</CardTitle>
            <CardDescription>By uptime over {RANGE_LABELS[range].toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {loading ? (
              <div className="space-y-2 px-6 pb-6">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : worstDevices.length === 0 ? (
              <EmptyState
                icon={Cpu}
                title="No devices yet"
                description="Uptime appears once devices are registered."
                className="mx-6 mb-6 border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Uptime</TableHead>
                    <TableHead>Drops</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {worstDevices.map((device) => (
                    <TableRow key={device.deviceId}>
                      <TableCell>
                        <Link
                          href={`/devices/${device.deviceId}`}
                          className="font-medium hover:underline"
                        >
                          {device.deviceName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={uptimeVariant(device.uptimeRatio)}>
                          {formatPercent(device.uptimeRatio)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {device.disconnections}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device events</CardTitle>
            <CardDescription>
              {loading ? "…" : `${formatCount(data.events.total)} in this window`}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {loading ? (
              <div className="space-y-2 px-6 pb-6">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : data.events.byType.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No events recorded"
                description="Connections, disconnections, and errors show up here."
                className="mx-6 mb-6 border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.byType.map((entry) => (
                    <TableRow key={entry.eventType}>
                      <TableCell className="font-medium">
                        {humanizeMetric(entry.eventType)}
                      </TableCell>
                      <TableCell className="tabular-nums">{entry.count}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatPercent(entry.count / data.events.total, 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {data && data.alerts.topDevices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Noisiest devices</CardTitle>
            <CardDescription>Most alerts raised in this window</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Alerts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.alerts.topDevices.map((device) => (
                  <TableRow key={device.deviceId}>
                    <TableCell>
                      <Link
                        href={`/devices/${device.deviceId}`}
                        className="font-medium hover:underline"
                      >
                        {device.deviceName}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{device.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <RequireAuth>
      <AnalyticsScreen />
    </RequireAuth>
  );
}
