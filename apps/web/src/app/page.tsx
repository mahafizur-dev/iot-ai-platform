"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchDevices, type DeviceResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/RequireAuth";
import { ApiStatusCard } from "@/components/ApiStatusCard";

function DeviceList() {
  const { withAuth } = useAuth();
  const [devices, setDevices] = useState<DeviceResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    withAuth((token) => fetchDevices(token))
      .then((result) => {
        if (!cancelled) setDevices(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load devices");
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth]);

  if (error) {
    return (
      <p className="text-red-600" role="alert">
        {error}
      </p>
    );
  }

  if (!devices) {
    return (
      <p className="text-slate-500" role="status">
        Loading devices…
      </p>
    );
  }

  if (devices.length === 0) {
    return <p className="text-slate-500">No devices yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {devices.map((device) => (
        <li key={device.id} className="flex items-center justify-between px-4 py-3">
          <div>
            <Link href={`/devices/${device.id}`} className="font-medium hover:underline">
              {device.name}
            </Link>
            <p className="text-xs text-slate-400">{device.type}</p>
          </div>
          <span className="text-sm text-slate-500">{device.status}</span>
        </li>
      ))}
    </ul>
  );
}

export default function OverviewPage() {
  return (
    <RequireAuth>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="mt-1 text-slate-500">
            Alerts, analytics, and the AI assistant land in later phases.
          </p>
        </div>

        <ApiStatusCard />

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Devices</h2>
          <DeviceList />
        </section>
      </div>
    </RequireAuth>
  );
}
