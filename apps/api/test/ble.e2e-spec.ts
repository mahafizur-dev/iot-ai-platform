import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";

/**
 * Exercises Phase 7's BLE seam end to end against the seeded MockBleAdapter
 * device (see apps/api/src/ble/mock-ble.adapter.ts) — scan → connect →
 * read/write a characteristic → register the device into the shared
 * registry, confirming the bridge into `devices` round-trips correctly.
 */
describe("BLE (e2e)", () => {
  let app: INestApplication;
  const runId = Date.now();
  const email = `e2e-ble-${runId}@example.com`;
  const password = "correct-horse-1";

  const THERMOSTAT_ID = "ble-sim-thermostat";
  const THERMOSTAT_CHAR = "00002a6e-0000-1000-8000-00805f9b34fb";

  let accessToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Ada", organizationName: `Org ${runId}` })
      .expect(201);

    accessToken = response.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    await request(app.getHttpServer()).get("/api/v1/ble/devices").expect(401);
  });

  it("scans and finds the seeded simulated device, disconnected", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/ble/devices")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: THERMOSTAT_ID, status: "disconnected" }),
      ]),
    );
  });

  it("connects to the device", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/ble/devices/${THERMOSTAT_ID}/connect`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);
  });

  it("reads a characteristic once connected", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/ble/devices/${THERMOSTAT_ID}/characteristics/${THERMOSTAT_CHAR}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      deviceId: THERMOSTAT_ID,
      characteristicId: THERMOSTAT_CHAR,
    });
    expect(response.body.data.data).toEqual(expect.any(String));
  });

  it("404s reading an unknown characteristic", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/ble/devices/${THERMOSTAT_ID}/characteristics/unknown-uuid`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(404);
  });

  it("400s writing to a characteristic on a device that isn't connected", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/ble/devices/ble-sim-lock/characteristics/00002a3d-0000-1000-8000-00805f9b34fb`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ data: Buffer.from("hello").toString("base64") })
      .expect(400);
  });

  it("registers the connected device into the shared device registry", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/ble/devices/${THERMOSTAT_ID}/register`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(response.body.data).toMatchObject({ type: "ble", name: "Simulated Thermostat" });
    expect(response.body.data.metadata).toMatchObject({ bleDeviceId: THERMOSTAT_ID });

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/devices/${response.body.data.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(getResponse.body.data.type).toBe("ble");
  });

  it("disconnects the device", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/ble/devices/${THERMOSTAT_ID}/disconnect`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);
  });
});
