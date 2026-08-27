import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "IoT AI Platform",
  description: "IoT device management, telemetry, and AI-powered insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <AppHeader />
            <main className="flex-1 px-6 py-8">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
