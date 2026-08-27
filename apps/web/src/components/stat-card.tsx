import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  loading = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  accent?: "success" | "destructive" | "warning";
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon
          className={cn(
            "size-4 text-muted-foreground",
            accent === "success" && "text-success",
            accent === "destructive" && "text-destructive",
            accent === "warning" && "text-warning",
          )}
          aria-hidden
        />
      </CardHeader>

      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        )}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
