"use client";

import { use } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { DeviceDetail } from "@/components/device/device-detail";

export default function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = use(params);

  return (
    <RequireAuth>
      <DeviceDetail deviceId={deviceId} />
    </RequireAuth>
  );
}
