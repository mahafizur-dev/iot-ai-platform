"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function AppHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <Link href="/" className="text-lg font-semibold">
        IoT AI Platform
      </Link>

      {user && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{user.email}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
