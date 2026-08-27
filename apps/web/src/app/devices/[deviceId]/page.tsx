"use client";

import { use } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { LiveTelemetryTable } from "@/components/LiveTelemetryTable";

export default function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = use(params);

  return (
    <RequireAuth>
      <LiveTelemetryTable deviceId={deviceId} />
    </RequireAuth>
  );
}
