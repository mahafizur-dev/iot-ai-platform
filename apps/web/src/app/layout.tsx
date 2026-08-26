import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IoT AI Platform",
  description: "IoT device management, telemetry, and AI-powered insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white px-6 py-4">
            <span className="text-lg font-semibold">IoT AI Platform</span>
          </header>
          <main className="flex-1 px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
