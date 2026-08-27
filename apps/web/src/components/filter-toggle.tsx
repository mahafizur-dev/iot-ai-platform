"use client";

import { cn } from "@/lib/utils";

/**
 * The segmented control the alerts, devices, and analytics screens all use for
 * their filters. Extracted rather than copied a fourth time — and it keeps the
 * `aria-pressed` semantics in one place.
 */
export function FilterToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  renderLabel,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  renderLabel?: (option: T) => string;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-lg bg-muted p-1", className)}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors",
            value === option
              ? "bg-background text-foreground shadow"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {renderLabel ? renderLabel(option) : option}
        </button>
      ))}
    </div>
  );
}
