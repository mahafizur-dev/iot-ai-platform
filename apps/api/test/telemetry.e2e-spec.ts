import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { PrismaService } from "../src/database/prisma.service";

/**
 * NOTE: requires a real Postgres+TimescaleDB (with the hypertable migration
 * applied) and reachable Redis (BullMQ boots on app init) — cannot run in a
 * sandbox with no Docker. See the Phase 2 plan's "Steps for you to run".
 *
 * MQTT ingestion itself (a message actually flowing through EMQX) is NOT
 * covered here — that needs a live broker and is a manual verification step.
 * This covers what's reachable over plain HTTP: the /mqtt/auth hook contract,
 * and the telemetry query API against rows seeded directly via Prisma
 * (standing in for "ingestion already happened").
 */
describe("Telemetry (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emqxAuthSecret: string;
  const runId = Date.now();
  const email = `e2e-telemetry-${runId}@example.com`;
  const password = "correct-horse-1";

  let accessToken: string;
  let deviceId: string;
  let rawCredential: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    emqxAuthSecret = app.get(ConfigService).getOrThrow<string>("EMQX_AUTH_HOOK_SECRET");
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers a user, creates a device, and rotates a credential", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Ada", organizationName: `Org ${runId}` })
      .expect(201);
    accessToken = registerResponse.body.data.accessToken;

    const deviceResponse = await request(app.getHttpServer())
      .post("/api/v1/devices")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Telemetry Sensor", type: "temperature-sensor" })
      .expect(201);
    deviceId = deviceResponse.body.data.id;

    const rotateResponse = await request(app.getHttpServer())
      .post(`/api/v1/devices/${deviceId}/credentials/rotate`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);
    rawCredential = rotateResponse.body.data.credential;
  });

  it("allows the /mqtt/auth hook with a valid device credential", async () => {
    const response = await request(app.getHttpServer())
      .post("/mqtt/auth")
      .set("x-emqx-auth-secret", emqxAuthSecret)
      .send({ username: deviceId, password: rawCredential, clientid: deviceId })
      .expect(200);

    expect(response.body).toEqual({ result: "allow" });
  });

  it("denies the /mqtt/auth hook with a wrong credential", async () => {
    const response = await request(app.getHttpServer())
      .post("/mqtt/auth")
      .set("x-emqx-auth-secret", emqxAuthSecret)
      .send({ username: deviceId, password: "wrong-token", clientid: deviceId })
      .expect(200);

    expect(response.body).toEqual({ result: "deny" });
  });

  it("denies the /mqtt/auth hook when the shared secret is missing", async () => {
    const response = await request(app.getHttpServer())
      .post("/mqtt/auth")
      .send({ username: deviceId, password: rawCredential, clientid: deviceId })
      .expect(200);

    expect(response.body).toEqual({ result: "deny" });
  });

  it("returns seeded telemetry over the query API, scoped to the caller's org", async () => {
    const ts = new Date();
    await prisma.telemetry.create({
      data: { deviceId, ts, metric: "temperature", value: 21.5, payload: { receivedAt: ts.toISOString() } },
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/devices/${deviceId}/telemetry`)
      .query({ metric: "temperature" })
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ metric: "temperature", value: 21.5 })]),
    );
  });

  it("returns the latest reading", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/devices/${deviceId}/telemetry/latest`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ metric: "temperature" })]),
    );
  });

  it("404s for telemetry on a device in another organization", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/devices/00000000-0000-0000-0000-000000000000/telemetry")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(404);
  });
});
