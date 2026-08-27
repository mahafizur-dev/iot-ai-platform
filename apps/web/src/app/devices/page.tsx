"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Cpu, Search } from "lucide-react";
import { fetchDevicePage, type DeviceResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/lib/use-socket";
import { applyStatusChange } from "@/lib/fleet";
import { formatRelativeTime } from "@/lib/format";
import { RequireAuth } from "@/components/RequireAuth";
import { FilterToggle } from "@/components/filter-toggle";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 20;
const STATUS_FILTERS = ["all", "online", "offline", "unknown"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function DevicesScreen() {
  const { accessToken, withAuth } = useAuth();
  const { socket } = useSocket(accessToken);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [devices, setDevices] = useState<DeviceResponse[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDevices(null);

    withAuth((token) =>
      fetchDevicePage(token, {
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
        sort: "name:asc",
      }),
    )
      .then((result) => {
        if (cancelled) return;
        setDevices(result.items);
        setTotal(result.total);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load devices");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth, page, status]);

  useEffect(() => {
    if (!socket) return;

    const onStatus = (event: { deviceId: string; status: "online" | "offline" }) => {
      setDevices((current) =>
        current ? applyStatusChange(current, event.deviceId, event.status) : current,
      );
    };

    socket.on("device:status_changed", onStatus);
    return () => {
      socket.off("device:status_changed", onStatus);
    };
  }, [socket]);

  // Name search runs over the loaded page rather than the server: the devices
  // endpoint filters on status/type but has no name query yet. The hint under
  // the table says so, so an empty result isn't read as "no such device".
  const visible = useMemo(() => {
    if (!devices) return null;
    const needle = search.trim().toLowerCase();
    if (!needle) return devices;

    return devices.filter(
      (device) =>
        device.name.toLowerCase().includes(needle) || device.type.toLowerCase().includes(needle),
    );
  }, [devices, search]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} device{total === 1 ? "" : "s"} in your organization.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Filter by name or type"
            aria-label="Filter devices"
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <FilterToggle
          options={STATUS_FILTERS}
          value={status}
          onChange={(next) => {
            setStatus(next);
            // A filter change invalidates the current page number — page 3 of
            // "all" is rarely page 3 of "offline".
            setPage(1);
          }}
          label="Status filter"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {visible === null ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title={search ? "No devices match that filter" : "No devices here"}
              description={
                search
                  ? "Filtering applies to the devices loaded on this page."
                  : "Provision a device through the API, or try a different status filter."
              }
              className="m-6 border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <Link href={`/devices/${device.id}`} className="font-medium hover:underline">
                        {device.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{device.type}</TableCell>
                    <TableCell className="text-muted-foreground">{device.model ?? "—"}</TableCell>
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {lastPage}
          {search && " · filtering this page only"}
        </span>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft aria-hidden />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DevicesPage() {
  return (
    <RequireAuth>
      <DevicesScreen />
    </RequireAuth>
  );
}
