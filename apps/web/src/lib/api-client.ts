import type {
  AlertResponse,
  AlertRuleResponse,
  ApiResponse,
  ApiSuccessResponse,
  DeviceStatusPayload,
  HealthStatus,
  NotificationPreferenceResponse,
  NotificationResponse,
  TelemetryAggregatePoint,
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

async function unwrapEnvelope<T>(response: Response): Promise<ApiSuccessResponse<T>> {
  const body = (await response.json()) as ApiResponse<T>;

  if (!body.success) {
    throw new ApiError(body.error.message, response.status, body.error.code);
  }

  return body;
}

async function unwrap<T>(response: Response): Promise<T> {
  return (await unwrapEnvelope<T>(response)).data;
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
async function requestEnvelope<T>(
  url: string,
  init: RequestInit,
  accessToken?: string,
): Promise<ApiSuccessResponse<T>> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(url, { ...init, headers, credentials: "include", cache: "no-store" });

  if (!response.ok && response.status !== 400 && response.status !== 401 && response.status !== 404) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  return unwrapEnvelope<T>(response);
}

async function request<T>(url: string, init: RequestInit, accessToken?: string): Promise<T> {
  return (await requestEnvelope<T>(url, init, accessToken)).data;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
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

export interface DeviceListQuery {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  sort?: string;
}

export interface DevicePage {
  items: DeviceResponse[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Paged variant — `fetchDevices` discards `meta`, which the devices screen
 * needs for its pager. The API omits `meta` fields it wasn't given, so the
 * requested page/limit are the fallbacks rather than 0.
 */
export async function fetchDevicePage(
  accessToken: string,
  query: DeviceListQuery = {},
): Promise<DevicePage> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const envelope = await requestEnvelope<DeviceResponse[]>(
    apiV1(`/devices${queryString({ ...query, page, limit })}`),
    { method: "GET" },
    accessToken,
  );

  return {
    items: envelope.data,
    page: envelope.meta?.page ?? page,
    limit: envelope.meta?.limit ?? limit,
    total: envelope.meta?.total ?? envelope.data.length,
  };
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

export interface TelemetryRangeParams {
  from?: string;
  to?: string;
  metric?: string;
  agg?: "avg" | "min" | "max";
  interval?: "hour" | "day";
}

/**
 * Raw points when `agg`/`interval` are omitted, continuous-aggregate buckets
 * when they're supplied — the API returns one shape or the other from the same
 * route, so callers narrow on which they asked for.
 */
export async function fetchTelemetryRange(
  accessToken: string,
  deviceId: string,
  params: TelemetryRangeParams,
): Promise<TelemetryPoint[] | TelemetryAggregatePoint[]> {
  return request<TelemetryPoint[] | TelemetryAggregatePoint[]>(
    apiV1(`/devices/${deviceId}/telemetry${queryString({ ...params })}`),
    { method: "GET" },
    accessToken,
  );
}

export async function rotateDeviceCredential(
  accessToken: string,
  deviceId: string,
): Promise<string> {
  const result = await request<{ credential: string }>(
    apiV1(`/devices/${deviceId}/credentials/rotate`),
    { method: "POST" },
    accessToken,
  );

  return result.credential;
}

export interface AlertListQuery {
  page?: number;
  limit?: number;
  status?: string;
  severity?: string;
  deviceId?: string;
}

export interface AlertPage {
  items: AlertResponse[];
  page: number;
  limit: number;
  total: number;
}

export async function fetchAlerts(
  accessToken: string,
  query: AlertListQuery = {},
): Promise<AlertPage> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const envelope = await requestEnvelope<AlertResponse[]>(
    apiV1(`/alerts${queryString({ ...query, page, limit })}`),
    { method: "GET" },
    accessToken,
  );

  return {
    items: envelope.data,
    page: envelope.meta?.page ?? page,
    limit: envelope.meta?.limit ?? limit,
    total: envelope.meta?.total ?? envelope.data.length,
  };
}

export async function acknowledgeAlert(
  accessToken: string,
  alertId: string,
): Promise<AlertResponse> {
  return request<AlertResponse>(
    apiV1(`/alerts/${alertId}/acknowledge`),
    { method: "POST" },
    accessToken,
  );
}

export async function resolveAlert(accessToken: string, alertId: string): Promise<AlertResponse> {
  return request<AlertResponse>(apiV1(`/alerts/${alertId}/resolve`), { method: "POST" }, accessToken);
}

export async function fetchAlertRules(accessToken: string): Promise<AlertRuleResponse[]> {
  return request<AlertRuleResponse[]>(apiV1("/alert-rules"), { method: "GET" }, accessToken);
}

export interface AlertRuleInput {
  deviceId?: string;
  metric: string;
  condition: string;
  threshold: number;
  thresholdSecondary?: number;
  severity?: string;
  enabled?: boolean;
}

export async function createAlertRule(
  accessToken: string,
  input: AlertRuleInput,
): Promise<AlertRuleResponse> {
  return request<AlertRuleResponse>(
    apiV1("/alert-rules"),
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export async function updateAlertRule(
  accessToken: string,
  ruleId: string,
  input: Partial<AlertRuleInput>,
): Promise<AlertRuleResponse> {
  return request<AlertRuleResponse>(
    apiV1(`/alert-rules/${ruleId}`),
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
  );
}

export async function deleteAlertRule(accessToken: string, ruleId: string): Promise<void> {
  await request<{ deleted: true }>(apiV1(`/alert-rules/${ruleId}`), { method: "DELETE" }, accessToken);
}

export async function fetchNotifications(
  accessToken: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationResponse[]> {
  return request<NotificationResponse[]>(
    apiV1(
      `/notifications${queryString({
        unreadOnly: options.unreadOnly ? "true" : undefined,
        limit: options.limit ?? 20,
      })}`,
    ),
    { method: "GET" },
    accessToken,
  );
}

export async function fetchUnreadCount(accessToken: string): Promise<number> {
  const result = await request<{ unreadCount: number }>(
    apiV1("/notifications/unread-count"),
    { method: "GET" },
    accessToken,
  );

  return result.unreadCount;
}

export async function markNotificationRead(
  accessToken: string,
  notificationId: string,
): Promise<NotificationResponse> {
  return request<NotificationResponse>(
    apiV1(`/notifications/${notificationId}/read`),
    { method: "PATCH" },
    accessToken,
  );
}

export async function markAllNotificationsRead(accessToken: string): Promise<number> {
  const result = await request<{ updated: number }>(
    apiV1("/notifications/read-all"),
    { method: "POST" },
    accessToken,
  );

  return result.updated;
}

export async function fetchNotificationPreferences(
  accessToken: string,
): Promise<NotificationPreferenceResponse[]> {
  return request<NotificationPreferenceResponse[]>(
    apiV1("/notifications/preferences"),
    { method: "GET" },
    accessToken,
  );
}

export async function updateNotificationPreferences(
  accessToken: string,
  preferences: NotificationPreferenceResponse[],
): Promise<NotificationPreferenceResponse[]> {
  return request<NotificationPreferenceResponse[]>(
    apiV1("/notifications/preferences"),
    { method: "PATCH", body: JSON.stringify({ preferences }) },
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

export type {
  AlertResponse,
  AlertRuleResponse,
  DeviceStatusPayload,
  NotificationPreferenceResponse,
  NotificationResponse,
  TelemetryAggregatePoint,
  TelemetryPoint,
};
