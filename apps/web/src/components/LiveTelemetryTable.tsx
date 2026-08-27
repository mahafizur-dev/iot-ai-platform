"use client";

import { useEffect, useState } from "react";
import type { TelemetryPoint } from "@iot-ai-platform/shared-types";
import { fetchDevice, fetchLatestTelemetry, type DeviceResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useDeviceSubscription, useSocket } from "@/lib/use-socket";

/** Latest reading per metric, seeded from REST then kept current by the socket. */
type ReadingsByMetric = Record<string, TelemetryPoint>;

function indexByMetric(points: TelemetryPoint[]): ReadingsByMetric {
  return Object.fromEntries(points.map((point) => [point.metric, point]));
}

export function LiveTelemetryTable({ deviceId }: { deviceId: string }) {
  const { accessToken, withAuth } = useAuth();
  const { socket, connected } = useSocket(accessToken);
  useDeviceSubscription(socket, deviceId);

  const [device, setDevice] = useState<DeviceResponse | null>(null);
  const [readings, setReadings] = useState<ReadingsByMetric>({});
  const [error, setError] = useState<string | null>(null);

  // Seed from REST — the socket only carries changes from here on, so without
  // this the page would look empty until the device next publishes.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      withAuth((token) => fetchDevice(token, deviceId)),
      withAuth((token) => fetchLatestTelemetry(token, deviceId)),
    ])
      .then(([loadedDevice, latest]) => {
        if (cancelled) return;
        setDevice(loadedDevice);
        setReadings(indexByMetric(latest));
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load device");
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth, deviceId]);

  useEffect(() => {
    if (!socket) return;

    const onTelemetry = (event: { deviceId: string; reading: TelemetryPoint }) => {
      if (event.deviceId !== deviceId) return;
      setReadings((current) => ({ ...current, [event.reading.metric]: event.reading }));
    };

    const onStatus = (event: { deviceId: string; status: "online" | "offline" }) => {
      if (event.deviceId !== deviceId) return;
      setDevice((current) => (current ? { ...current, status: event.status } : current));
    };

    socket.on("telemetry:update", onTelemetry);
    socket.on("device:status_changed", onStatus);

    return () => {
      socket.off("telemetry:update", onTelemetry);
      socket.off("device:status_changed", onStatus);
    };
  }, [socket, deviceId]);

  if (error) {
    return (
      <p className="text-red-600" role="alert">
        {error}
      </p>
    );
  }

  if (!device) {
    return (
      <p className="text-slate-500" role="status">
        Loading device…
      </p>
    );
  }

  const metrics = Object.keys(readings).sort();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{device.name}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {device.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{device.type}</p>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-400" data-testid="socket-status">
        <span
          className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}
        />
        {connected ? "Live" : "Not connected"}
      </p>

      {metrics.length === 0 ? (
        <p className="text-slate-500">No telemetry yet for this device.</p>
      ) : (
        <table className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Metric</th>
              <th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {metrics.map((metric) => {
              const reading = readings[metric];
              if (!reading) return null;

              return (
                <tr key={metric}>
                  <td className="px-4 py-2 font-medium">{metric}</td>
                  <td className="px-4 py-2">{reading.value}</td>
                  <td className="px-4 py-2 text-slate-400">
                    {new Date(reading.ts).toLocaleTimeString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
