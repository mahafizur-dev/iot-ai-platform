"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/lib/use-socket";
import { useNotifications } from "@/lib/use-notifications";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationBell() {
  const { accessToken } = useAuth();
  const { socket } = useSocket(accessToken);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(socket);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        >
          <Bell aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
              data-testid="unread-badge"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="px-0 py-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck aria-hidden />
              Mark all read
            </Button>
          )}
        </div>

        <DropdownMenuSeparator className="mx-0 my-0" />

        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => {
              // An alert notification links to the alerts screen; anything
              // else is informational and stays a plain row.
              const href =
                notification.relatedEntityType === "alert" ? "/alerts" : null;

              const body = (
                <>
                  <div className="flex items-start gap-2">
                    {!notification.readAt && (
                      <span
                        aria-hidden
                        className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-destructive"
                      />
                    )}
                    <span
                      className={cn(
                        "text-sm",
                        notification.readAt ? "text-muted-foreground" : "font-medium",
                      )}
                    >
                      {notification.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{notification.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </>
              );

              return (
                <li key={notification.id} className="border-b last:border-b-0">
                  {href ? (
                    <Link
                      href={href}
                      onClick={() => void markRead(notification.id)}
                      className="block px-3 py-2 transition-colors hover:bg-accent"
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markRead(notification.id)}
                      className="block w-full px-3 py-2 text-left transition-colors hover:bg-accent"
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
