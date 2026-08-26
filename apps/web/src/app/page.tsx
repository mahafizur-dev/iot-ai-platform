import { ApiStatusCard } from "@/components/ApiStatusCard";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-slate-500">
          Application shell for the IoT AI Platform. Device management, live telemetry, alerts,
          analytics, and the AI assistant land in later phases.
        </p>
      </div>

      <ApiStatusCard />
    </div>
  );
}
