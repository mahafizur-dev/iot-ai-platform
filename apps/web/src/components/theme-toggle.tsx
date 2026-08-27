"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const THEME_STORAGE_KEY = "iot-ai-theme";

/**
 * Deliberately not `next-themes`: one class on <html> and one localStorage key
 * is the whole requirement, and the no-flash script in the layout already
 * covers the only hard part.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  // Read on mount rather than during render: the server has no way to know
  // which theme this visitor picked, so rendering it would mismatch.
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private mode or blocked storage: the toggle still works for this page.
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Moon aria-hidden /> : <Sun aria-hidden />}
    </Button>
  );
}
