import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusVariant } from "@/lib/format";

/** Device status pill — dot plus label, coloured off the shared status map. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = statusVariant(status);

  return (
    <Badge variant={variant} className={cn("capitalize", className)}>
      <span
        aria-hidden
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          variant === "success" && "bg-success",
          variant === "destructive" && "bg-destructive",
          variant === "warning" && "bg-warning",
          variant === "secondary" && "bg-muted-foreground",
        )}
      />
      {status}
    </Badge>
  );
}
