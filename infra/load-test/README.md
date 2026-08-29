# Load testing

Per docs/ARCHITECTURE.md §12, load testing is "later, not a v1 blocker" — this
is a minimal starting point, not wired into CI or `turbo.json`.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed locally.
- The full local stack running (`docker compose -f infra/docker-compose.yml up`)
  and the API reachable (`pnpm --filter @iot-ai-platform/api dev`, or the
  Docker Compose `api` service).
- **Rate limiting**: `telemetry-query.k6.js` runs many virtual users from one
  IP. Phase 7's platform-wide rate limiter (`RATE_LIMIT_PER_MINUTE`, default
  100/min/IP — see docs/ARCHITECTURE.md §8) will throttle a run using more
  than ~1-2 req/s from a single host. Raise `RATE_LIMIT_PER_MINUTE` in the
  target environment before running a higher-throughput test.

## Running

```sh
API_BASE_URL=http://localhost:4000 pnpm load-test
```

`telemetry-query.k6.js` registers one user and device in `setup()`, then
ramps virtual users querying `GET /devices/:id/telemetry` (0→20 over 30s,
holds for 1m, ramps down), asserting HTTP 200 and a p95 latency threshold.
The device has no seeded telemetry rows, so this measures the query path's
request-handling overhead, not a specific data volume — point `deviceId` at
a device with real rows (edit the script, or extend `setup()`) to test
against representative data.

## Known gap: MQTT ingestion-path load testing

Not built here. k6 core has no MQTT protocol support; a custom `xk6-mqtt`
build would be needed to simulate device publish throughput. Worth revisiting
if telemetry ingestion (not query) turns out to be the bottleneck.
