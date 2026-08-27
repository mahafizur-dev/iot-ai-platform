"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, Check, CircleCheck, Sparkles } from "lucide-react";
import type { AlertResponse } from "@iot-ai-platform/shared-types";
import { acknowledgeAlert, fetchAlerts, resolveAlert } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/lib/use-socket";
import { useAssistant } from "@/lib/assistant-context";
import { alertStatusVariant, applyAlertEvent, severityVariant } from "@/lib/alerts";
import { formatRelativeTime } from "@/lib/format";
import { RequireAuth } from "@/components/RequireAuth";
import { FilterToggle } from "@/components/filter-toggle";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_FILTERS = ["open", "acknowledged", "resolved", "all"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function AlertsScreen() {
  const { user, accessToken, withAuth } = useAuth();
  const { socket } = useSocket(accessToken);
  const assistant = useAssistant();

  const [status, setStatus] = useState<StatusFilter>("open");
  const [alerts, setAlerts] = useState<AlertResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const canAct = user?.permissions.includes("alert:ack") ?? false;
  const canUseAI = user?.permissions.includes("ai:use") ?? false;

  useEffect(() => {
    let cancelled = false;
    setAlerts(null);

    withAuth((token) => fetchAlerts(token, { status: status === "all" ? undefined : status }))
      .then((page) => {
        if (!cancelled) setAlerts(page.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load alerts");
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth, status]);

  // Both events funnel through applyAlertEvent, which knows the current filter
  // — an alert that gets acknowledged should leave the "open" view, not sit
  // there with a stale badge.
  useEffect(() => {
    if (!socket) return;

    const onEvent = (event: { alert: AlertResponse }) => {
      setAlerts((current) => (current ? applyAlertEvent(current, event.alert, status) : current));
    };

    socket.on("alert:triggered", onEvent);
    socket.on("alert:updated", onEvent);

    return () => {
      socket.off("alert:triggered", onEvent);
      socket.off("alert:updated", onEvent);
    };
  }, [socket, status]);

  const act = async (
    alertId: string,
    action: (token: string, id: string) => Promise<AlertResponse>,
  ) => {
    setPending(alertId);
    setError(null);

    try {
      const updated = await withAuth((token) => action(token, alertId));
      // The socket event will arrive too, but updating here means the row
      // reacts immediately even if the socket is down.
      setAlerts((current) => (current ? applyAlertEvent(current, updated, status) : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Raised by your{" "}
          <Link href="/alert-rules" className="underline underline-offset-4">
            alert rules
          </Link>{" "}
          as telemetry arrives. Recovered metrics resolve themselves.
        </p>
      </div>

      <FilterToggle
        options={STATUS_FILTERS}
        value={status}
        onChange={setStatus}
        label="Status filter"
      />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {alerts === null ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title={status === "open" ? "Nothing is wrong right now" : "No alerts here"}
              description={
                status === "open"
                  ? "Open alerts appear the moment a rule is breached."
                  : "Try a different status filter."
              }
              className="m-6 border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Triggered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Badge variant={severityVariant(alert.severity)} className="capitalize">
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/devices/${alert.deviceId}`}
                        className="font-medium hover:underline"
                      >
                        {alert.deviceName ?? alert.deviceId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{alert.message}</TableCell>
                    <TableCell>
                      <Badge variant={alertStatusVariant(alert.status)} className="capitalize">
                        {alert.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeTime(alert.triggeredAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canUseAI && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void assistant.explainAlert(
                                alert.id,
                                `${alert.deviceName ?? alert.deviceId}: ${alert.message}`,
                              )
                            }
                          >
                            <Sparkles aria-hidden />
                            Explain
                          </Button>
                        )}
                        {alert.status !== "resolved" && canAct && (
                          <>
                            {alert.status === "open" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pending === alert.id}
                                onClick={() => void act(alert.id, acknowledgeAlert)}
                              >
                                <Check aria-hidden />
                                Ack
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending === alert.id}
                              onClick={() => void act(alert.id, resolveAlert)}
                            >
                              <CircleCheck aria-hidden />
                              Resolve
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!canAct && (
        <p className="text-xs text-muted-foreground">
          Your role does not include <code>alert:ack</code>, so alerts are read-only here.
        </p>
      )}
    </div>
  );
}

export default function AlertsPage() {
  return (
    <RequireAuth>
      <AlertsScreen />
    </RequireAuth>
  );
}
