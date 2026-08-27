"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BellRing, Cpu, CircleSlash, Wifi, HelpCircle } from "lucide-react";
import { fetchAlerts, fetchDevicePage, type DeviceResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/lib/use-socket";
import { applyStatusChange, summarizeFleet } from "@/lib/fleet";
import { formatRelativeTime } from "@/lib/format";
import { RequireAuth } from "@/components/RequireAuth";
import { ApiStatusCard } from "@/components/ApiStatusCard";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { FleetMixChart } from "@/components/fleet-mix-chart";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * One page's worth is enough to characterise a fleet of the size this phase
 * targets, and it doubles as the recent-devices list. A dedicated
 * `/devices/stats` endpoint is the right answer once a fleet outgrows this.
 */
const SUMMARY_PAGE_SIZE = 100;
const RECENT_LIMIT = 6;

function Overview() {
  const { accessToken, withAuth } = useAuth();
  const { socket } = useSocket(accessToken);

  const [devices, setDevices] = useState<DeviceResponse[] | null>(null);
  const [openAlerts, setOpenAlerts] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    withAuth((token) => fetchDevicePage(token, { limit: SUMMARY_PAGE_SIZE, sort: "createdAt:desc" }))
      .then((page) => {
        if (!cancelled) setDevices(page.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load devices");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth]);

  // Only the count matters here, so ask for a single row and read `meta.total`
  // rather than pulling every open alert down to measure the list.
  useEffect(() => {
    let cancelled = false;

    withAuth((token) => fetchAlerts(token, { status: "open", limit: 1 }))
      .then((page) => {
        if (!cancelled) setOpenAlerts(page.total);
      })
      .catch(() => {
        // A viewer without alert:read still gets a working overview; the tile
        // just stays blank rather than blocking the whole page.
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth]);

  // The gateway joins every socket to its org room on connect, so status
  // changes and alerts for the whole fleet arrive without an explicit
  // subscription.
  useEffect(() => {
    if (!socket) return;

    const onStatus = (event: { deviceId: string; status: "online" | "offline" }) => {
      setDevices((current) =>
        current ? applyStatusChange(current, event.deviceId, event.status) : current,
      );
    };

    const onAlertTriggered = () => setOpenAlerts((current) => (current ?? 0) + 1);

    const onAlertUpdated = (event: { alert: { status: string } }) => {
      // The tile counts `status === "open"`, which is what the seed query
      // asked for — so acknowledging counts as leaving, not just resolving.
      if (event.alert.status !== "open") {
        setOpenAlerts((current) => Math.max(0, (current ?? 1) - 1));
      }
    };

    socket.on("device:status_changed", onStatus);
    socket.on("alert:triggered", onAlertTriggered);
    socket.on("alert:updated", onAlertUpdated);

    return () => {
      socket.off("device:status_changed", onStatus);
      socket.off("alert:triggered", onAlertTriggered);
      socket.off("alert:updated", onAlertUpdated);
    };
  }, [socket]);

  const loading = devices === null;
  const summary = summarizeFleet(devices ?? []);
  const recent = (devices ?? []).slice(0, RECENT_LIMIT);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live fleet health and open alerts. The AI assistant lands in a later phase.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Devices" value={summary.total} icon={Cpu} loading={loading} />
        <StatCard
          label="Online"
          value={summary.online}
          icon={Wifi}
          accent="success"
          loading={loading}
          hint="Updates live"
        />
        <StatCard
          label="Offline"
          value={summary.offline}
          icon={CircleSlash}
          accent="destructive"
          loading={loading}
        />
        <StatCard
          label="Never reported"
          value={summary.unknown}
          icon={HelpCircle}
          accent="warning"
          loading={loading}
        />
        <StatCard
          label="Open alerts"
          value={openAlerts ?? 0}
          icon={BellRing}
          accent={openAlerts ? "destructive" : undefined}
          loading={openAlerts === null}
          hint="Updates live"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fleet mix</CardTitle>
            <CardDescription>Devices by type</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[220px] w-full" /> : <FleetMixChart byType={summary.byType} />}
          </CardContent>
        </Card>

        <ApiStatusCard />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Recent devices</CardTitle>
            <CardDescription>Most recently provisioned</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/devices">
              View all
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {loading ? (
            <div className="space-y-2 px-6 pb-6">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title="No devices yet"
              description="Provision a device through the API to see it here."
              className="mx-6 mb-6"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <Link href={`/devices/${device.id}`} className="font-medium hover:underline">
                        {device.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{device.type}</TableCell>
                    <TableCell>
                      <StatusBadge status={device.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeTime(device.lastSeenAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <RequireAuth>
      <Overview />
    </RequireAuth>
  );
}
