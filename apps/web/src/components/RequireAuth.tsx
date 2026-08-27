"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Client-side guard rather than middleware.ts: the access token lives only in
 * memory (see auth-context), so Next's middleware — which runs on the server
 * and can see only cookies — has no way to tell a logged-in user from a
 * logged-out one. The API is the real enforcement boundary regardless; this
 * only decides what UI to show.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initializing && !user) {
      router.replace("/login");
    }
  }, [initializing, user, router]);

  if (initializing) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading…
      </p>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
