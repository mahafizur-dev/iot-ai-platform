"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@iot-ai-platform/shared-types";
import { getApiUrl } from "./api-client";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function getSocketUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? getApiUrl();
}

/**
 * One socket per access token. The token rides in `auth.token`, which is what
 * the gateway's handshake check reads — a socket that fails it is disconnected
 * server-side, so `connected` staying false is the signal that auth failed.
 */
export function useSocket(accessToken: string | null): { socket: AppSocket | null; connected: boolean } {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const next: AppSocket = io(getSocketUrl(), {
      auth: { token: accessToken },
      withCredentials: true,
      transports: ["websocket"],
    });

    next.on("connect", () => setConnected(true));
    next.on("disconnect", () => setConnected(false));

    setSocket(next);

    return () => {
      next.close();
    };
  }, [accessToken]);

  return { socket, connected };
}

/**
 * Subscribes to one device's room, re-subscribing after a reconnect.
 * Re-subscription is client-tracked rather than server-persisted (per
 * docs/ARCHITECTURE.md §7) — the server forgets rooms when a socket drops, so
 * the client that wanted the subscription is what re-establishes it.
 */
export function useDeviceSubscription(socket: AppSocket | null, deviceId: string | null): void {
  const subscribedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!socket || !deviceId) return;

    const subscribe = () => {
      socket.emit("subscribe:device", deviceId, () => {
        subscribedRef.current = deviceId;
      });
    };

    if (socket.connected) {
      subscribe();
    }
    socket.on("connect", subscribe);

    return () => {
      socket.off("connect", subscribe);
      if (subscribedRef.current === deviceId && socket.connected) {
        socket.emit("unsubscribe:device", deviceId, () => undefined);
      }
      subscribedRef.current = null;
    };
  }, [socket, deviceId]);
}
