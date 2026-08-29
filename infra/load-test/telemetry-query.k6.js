import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.API_BASE_URL || "http://localhost:4000";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 20 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

// Registers one user + device up front so every VU hits the query endpoint
// with a valid token, rather than each VU paying registration cost per
// iteration — the thing being measured is telemetry query latency, not auth.
export function setup() {
  const runId = Date.now();
  const email = `k6-${runId}@example.com`;
  const password = "correct-horse-1";

  const registerRes = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({
      email,
      password,
      name: "Load Test",
      organizationName: `Load Test Org ${runId}`,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(registerRes, { "setup: registered": (r) => r.status === 201 });
  const accessToken = registerRes.json("data.accessToken");

  const deviceRes = http.post(
    `${BASE_URL}/api/v1/devices`,
    JSON.stringify({ name: "Load Test Sensor", type: "temperature-sensor" }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` } },
  );
  check(deviceRes, { "setup: device created": (r) => r.status === 201 });
  const deviceId = deviceRes.json("data.id");

  return { accessToken, deviceId };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/v1/devices/${data.deviceId}/telemetry?metric=temperature`, {
    headers: { Authorization: `Bearer ${data.accessToken}` },
  });

  check(res, { "status is 200": (r) => r.status === 200 });

  sleep(1);
}
