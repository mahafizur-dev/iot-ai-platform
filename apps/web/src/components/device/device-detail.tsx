"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { TelemetryPoint } from "@iot-ai-platform/shared-types";
import { fetchDevice, fetchLatestTelemetry, type DeviceResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useDeviceSubscription, useSocket } from "@/lib/use-socket";
import { formatRelativeTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiveReadings } from "@/components/device/live-readings";
import { TelemetryChart } from "@/components/device/telemetry-chart";
import { DeviceDetails } from "@/components/device/device-details";
import { cn } from "@/lib/utils";

function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      data-testid="socket-status"
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-2 rounded-full",
          connected ? "animate-pulse bg-success" : "bg-muted-foreground/40",
        )}
      />
      {connected ? "Live" : "Not connected"}
    </span>
  );
}

export function DeviceDetail({ deviceId }: { deviceId: string }) {
  const { accessToken, withAuth } = useAuth();
  const { socket, connected } = useSocket(accessToken);
  useDeviceSubscription(socket, deviceId);

  const [device, setDevice] = useState<DeviceResponse | null>(null);
  const [latest, setLatest] = useState<TelemetryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Seeded over REST because the socket only carries changes from here on —
  // without this the page would look empty until the device next publishes.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      withAuth((token) => fetchDevice(token, deviceId)),
      withAuth((token) => fetchLatestTelemetry(token, deviceId)),
    ])
      .then(([loadedDevice, loadedLatest]) => {
        if (cancelled) return;
        setDevice(loadedDevice);
        setLatest(loadedLatest);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load device");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth, deviceId]);

  useEffect(() => {
    if (!socket) return;

    const onStatus = (event: { deviceId: string; status: "online" | "offline" }) => {
      if (event.deviceId !== deviceId) return;
      setDevice((current) => (current ? { ...current, status: event.status } : current));
    };

    socket.on("device:status_changed", onStatus);
    return () => {
      socket.off("device:status_changed", onStatus);
    };
  }, [socket, deviceId]);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Link href="/devices" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden />
          Devices
        </Link>
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="mx-auto max-w-6xl space-y-4" role="status" aria-label="Loading device">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const metrics = latest.map((point) => point.metric).sort();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/devices"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Devices
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{device.name}</h1>
          <StatusBadge status={device.status} />
          <LiveIndicator connected={connected} />
        </div>

        <p className="text-sm text-muted-foreground">
          {device.type}
          {device.model ? ` · ${device.model}` : ""} · last seen{" "}
          {formatRelativeTime(device.lastSeenAt)}
        </p>
      </div>

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <LiveReadings socket={socket} deviceId={deviceId} initialReadings={latest} />
        </TabsContent>

        <TabsContent value="history">
          <TelemetryChart deviceId={deviceId} metrics={metrics} />
        </TabsContent>

        <TabsContent value="details">
          <DeviceDetails device={device} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
