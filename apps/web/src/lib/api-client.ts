import type {
  ApiResponse,
  DeviceStatusPayload,
  HealthStatus,
  TelemetryPoint,
} from "@iot-ai-platform/shared-types";

export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

/** Everything except /health and /mqtt/auth lives under this prefix (see api's configure-app.ts). */
function apiV1(path: string): string {
  return `${getApiUrl()}/api/v1${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

export interface AuthResult {
  accessToken: string;
  user: UserProfile;
}

export interface DeviceResponse {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  model: string | null;
  status: string;
  firmwareVersion: string | null;
  hardwareVersion: string | null;
  macAddress: string | null;
  ownerUserId: string | null;
  lastSeenAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
}

async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;

  if (!body.success) {
    throw new ApiError(body.error.message, response.status, body.error.code);
  }

  return body.data;
}

/**
 * `credentials: "include"` on every call is mandatory: the refresh token is an
 * httpOnly cookie, so without it the cookie is neither stored on login nor
 * sent on refresh.
 *
 * Known deployment caveat: the API sets that cookie `sameSite: "strict"`. Web
 * (:3000) and API (:4000) are same-site on localhost so dev works, but a real
 * deployment across different registrable domains will silently stop sending
 * it. Fixing that is a deploy-time decision (sameSite/secure, or a same-domain
 * proxy via next.config.ts rewrites) — see Phase 8.
 */
async function request<T>(url: string, init: RequestInit, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(url, { ...init, headers, credentials: "include", cache: "no-store" });

  if (!response.ok && response.status !== 400 && response.status !== 401 && response.status !== 404) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  return unwrap<T>(response);
}

export async function login(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>(apiV1("/auth/login"), {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function refresh(): Promise<AuthResult> {
  return request<AuthResult>(apiV1("/auth/refresh"), { method: "POST" });
}

export async function logout(): Promise<void> {
  await request<{ loggedOut: true }>(apiV1("/auth/logout"), { method: "POST" });
}

export async function fetchDevices(accessToken: string): Promise<DeviceResponse[]> {
  return request<DeviceResponse[]>(apiV1("/devices"), { method: "GET" }, accessToken);
}

export async function fetchDevice(accessToken: string, deviceId: string): Promise<DeviceResponse> {
  return request<DeviceResponse>(apiV1(`/devices/${deviceId}`), { method: "GET" }, accessToken);
}

export async function fetchLatestTelemetry(
  accessToken: string,
  deviceId: string,
): Promise<TelemetryPoint[]> {
  return request<TelemetryPoint[]>(
    apiV1(`/devices/${deviceId}/telemetry/latest`),
    { method: "GET" },
    accessToken,
  );
}

export async function fetchHealth(): Promise<HealthStatus> {
  // /health is one of the two routes excluded from the api/v1 prefix.
  const response = await fetch(`${getApiUrl()}/health`, { cache: "no-store" });

  if (!response.ok) {
    throw new ApiError(`Health check failed with status ${response.status}`, response.status);
  }

  return unwrap<HealthStatus>(response);
}

export type { DeviceStatusPayload, TelemetryPoint };
