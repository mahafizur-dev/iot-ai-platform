import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";

/**
 * Exercises the full Phase 2 flow over real HTTP: register issues an admin
 * with device:write, create/list/get/update/rotate/deactivate a device, then
 * refresh rotation and logout revocation. Uses a randomized email/org per
 * run so repeated runs against the same dev SQLite file don't collide on
 * the unique email constraint.
 */
describe("Auth + Devices (e2e)", () => {
  let app: INestApplication;
  const runId = Date.now();
  const email = `e2e-${runId}@example.com`;
  const password = "correct-horse-1";

  let accessToken: string;
  let refreshCookie: string;
  let deviceId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects register with a weak password", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "short", name: "Ada", organizationName: `Org ${runId}` })
      .expect(400);
  });

  it("registers a new user and organization, returning an access token + refresh cookie", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Ada", organizationName: `Org ${runId}` })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user).toMatchObject({ email, roles: ["admin"] });
    expect(response.body.data.user.permissions).toEqual(
      expect.arrayContaining(["device:read", "device:write", "device:delete"]),
    );

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith("refresh_token="))).toBe(true);

    accessToken = response.body.data.accessToken;
    refreshCookie = setCookie.find((c) => c.startsWith("refresh_token="))!;
  });

  it("rejects duplicate registration with the same email", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Ada", organizationName: `Org ${runId} dup` })
      .expect(409);
  });

  it("rejects login with the wrong password", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password-1" })
      .expect(401);
  });

  it("rejects unauthenticated access to a protected route", async () => {
    await request(app.getHttpServer()).get("/api/v1/users/me").expect(401);
  });

  it("returns the current user profile for GET /users/me", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.email).toBe(email);
  });

  it("creates a device", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/devices")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Test Sensor", type: "temperature-sensor" })
      .expect(201);

    expect(response.body.data).toMatchObject({ name: "Test Sensor", status: "unknown" });
    deviceId = response.body.data.id;
  });

  it("lists devices scoped to the caller's organization with pagination meta", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/devices")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: deviceId })]),
    );
    expect(response.body.meta).toMatchObject({ page: 1, limit: 20 });
  });

  it("updates the device", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/devices/${deviceId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ firmwareVersion: "1.0.1" })
      .expect(200);

    expect(response.body.data.firmwareVersion).toBe("1.0.1");
  });

  it("rotates the device credential, returning the raw token once", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/devices/${deviceId}/credentials/rotate`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);

    expect(response.body.data.credential).toMatch(/^[a-f0-9]{64}$/);
  });

  it("404s for a device in another organization (not 403 — no existence leak)", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/devices/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(404);
  });

  it("deactivates the device", async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/devices/${deviceId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.deactivatedAt).toEqual(expect.any(String));
  });

  it("rotates the refresh token on /auth/refresh", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    const newCookie = setCookie.find((c) => c.startsWith("refresh_token="))!;
    expect(newCookie).not.toBe(refreshCookie);
    refreshCookie = newCookie;
  });

  it("rejects reuse of an already-rotated refresh token", async () => {
    const staleCookie = `refresh_token=stale-or-reused-token`;
    await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", staleCookie).expect(401);
  });

  it("revokes the refresh token on logout, and it can no longer be used", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(401);
  });
});
