"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { rotateDeviceCredential, type DeviceResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatRelativeTime, formatTimestamp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm">{value || "—"}</dd>
    </div>
  );
}

/** Metadata plus the credential-rotation action, both gated by what the token allows. */
export function DeviceDetails({ device }: { device: DeviceResponse }) {
  const { user, withAuth } = useAuth();
  const [credential, setCredential] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRotate = user?.permissions.includes("device:credentials:rotate") ?? false;

  const handleRotate = async () => {
    setRotating(true);
    setError(null);

    try {
      setCredential(await withAuth((token) => rotateDeviceCredential(token, device.id)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rotation failed");
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Device</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="ID" value={<code className="text-xs">{device.id}</code>} />
            <Field label="Type" value={device.type} />
            <Field label="Model" value={device.model} />
            <Field label="MAC address" value={device.macAddress} />
            <Field label="Firmware" value={device.firmwareVersion} />
            <Field label="Hardware" value={device.hardwareVersion} />
            <Field label="Last seen" value={formatRelativeTime(device.lastSeenAt)} />
            <Field label="Registered" value={formatTimestamp(device.createdAt)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MQTT credential</CardTitle>
          <CardDescription>
            Rotating issues a new secret and revokes the old one — the device stops connecting until
            it is reconfigured.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button variant="outline" onClick={handleRotate} disabled={!canRotate || rotating}>
            {rotating ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
            {rotating ? "Rotating…" : "Rotate credential"}
          </Button>

          {!canRotate && (
            <p className="text-xs text-muted-foreground">
              Your role does not include <code>device:credentials:rotate</code>.
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {credential && (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="text-xs font-medium text-warning">
                Copy this now — the API stores only a hash, so it cannot be shown again.
              </p>
              <code className="block break-all text-xs">{credential}</code>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
