import type { ApiResponse, HealthStatus } from "@iot-ai-platform/shared-types";

function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${getApiUrl()}/health`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  const body = (await response.json()) as ApiResponse<HealthStatus>;

  if (!body.success) {
    throw new Error(body.error.message);
  }

  return body.data;
}
