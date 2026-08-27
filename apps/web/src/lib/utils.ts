import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui's class helper: clsx resolves conditionals, tailwind-merge then
 * drops earlier Tailwind classes that a later one overrides, so a caller's
 * `className` can always beat a component's defaults.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
