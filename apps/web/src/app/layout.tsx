import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { THEME_STORAGE_KEY } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "IoT AI Platform",
  description: "IoT device management, telemetry, and AI-powered insights.",
};

/**
 * Runs before first paint so a dark-mode visitor never sees a white flash.
 * It has to be inline and blocking — a React effect runs too late.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
} catch (error) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script mutates <html> before hydration, and browser extensions
    // routinely stamp attributes on <body>; neither is a real mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
