"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationResponse } from "@iot-ai-platform/shared-types";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { AppSocket } from "@/lib/use-socket";

const RECENT_LIMIT = 15;

export interface NotificationsState {
  notifications: NotificationResponse[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * The bell's data. Seeded over REST, then kept current by `notification:new`
 * on the user's own socket room — which carries the server-computed unread
 * count alongside the notification, so the badge never needs a second call.
 */
export function useNotifications(socket: AppSocket | null): NotificationsState {
  const { accessToken, withAuth } = useAuth();
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    Promise.all([
      withAuth((token) => fetchNotifications(token, { limit: RECENT_LIMIT })),
      withAuth((token) => fetchUnreadCount(token)),
    ])
      .then(([loaded, count]) => {
        if (cancelled) return;
        setNotifications(loaded);
        setUnreadCount(count);
      })
      .catch(() => {
        // A failed bell load is not worth an error banner over the whole app;
        // the badge simply stays at zero until the next successful poll.
      });

    return () => {
      cancelled = true;
    };
  }, [withAuth, accessToken]);

  useEffect(() => {
    if (!socket) return;

    const onNotification = (event: {
      notification: NotificationResponse;
      unreadCount: number;
    }) => {
      setNotifications((current) => [event.notification, ...current].slice(0, RECENT_LIMIT));
      setUnreadCount(event.unreadCount);
    };

    socket.on("notification:new", onNotification);
    return () => {
      socket.off("notification:new", onNotification);
    };
  }, [socket]);

  const markRead = useCallback(
    async (id: string) => {
      const target = notifications.find((notification) => notification.id === id);
      if (!target || target.readAt) return;

      // Optimistic: the badge should drop the instant the row is clicked.
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id ? { ...notification, readAt } : notification,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));

      try {
        await withAuth((token) => markNotificationRead(token, id));
      } catch {
        // Put it back rather than showing a read row that the server still
        // counts as unread.
        setNotifications((current) =>
          current.map((notification) =>
            notification.id === id ? { ...notification, readAt: null } : notification,
          ),
        );
        setUnreadCount((current) => current + 1);
      }
    },
    [withAuth, notifications],
  );

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    const previous = notifications;
    const previousCount = unreadCount;

    setNotifications((current) =>
      current.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })),
    );
    setUnreadCount(0);

    try {
      await withAuth((token) => markAllNotificationsRead(token));
    } catch {
      setNotifications(previous);
      setUnreadCount(previousCount);
    }
  }, [withAuth, notifications, unreadCount]);

  return { notifications, unreadCount, markRead, markAllRead };
}
