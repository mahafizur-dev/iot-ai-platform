import { EventEmitter } from "node:events";
import mqtt from "mqtt";
import { MqttJsClient } from "./mqtt-js.client";

jest.mock("mqtt");

function buildConfig(values: Record<string, string>) {
  return {
    getOrThrow: (key: string) => values[key],
    get: (key: string) => values[key],
  };
}

describe("MqttJsClient", () => {
  let fakeClient: EventEmitter & { publish: jest.Mock; subscribe: jest.Mock; end: jest.Mock };

  beforeEach(() => {
    fakeClient = Object.assign(new EventEmitter(), {
      publish: jest.fn((_topic: string, _payload: unknown, cb: () => void) => cb()),
      subscribe: jest.fn((_filter: string, _opts: unknown, cb: () => void) => cb()),
      end: jest.fn((_force: boolean, _opts: unknown, cb: () => void) => cb()),
    });
    (mqtt.connect as jest.Mock) = jest.fn().mockReturnValue(fakeClient);
  });

  it("resolves connect() once the underlying client emits 'connect'", async () => {
    const client = new MqttJsClient(
      buildConfig({ MQTT_BROKER_URL: "mqtt://localhost:1883" }) as never,
    );

    const connectPromise = client.connect();
    fakeClient.emit("connect");

    await expect(connectPromise).resolves.toBeUndefined();
  });

  it("rejects connect() when the client emits 'error' first", async () => {
    const client = new MqttJsClient(
      buildConfig({ MQTT_BROKER_URL: "mqtt://localhost:1883" }) as never,
    );

    const connectPromise = client.connect();
    fakeClient.emit("error", new Error("boom"));

    await expect(connectPromise).rejects.toThrow("boom");
  });

  it("rejects publish() before a connection has been established", async () => {
    const client = new MqttJsClient(
      buildConfig({ MQTT_BROKER_URL: "mqtt://localhost:1883" }) as never,
    );

    await expect(client.publish("topic", "payload")).rejects.toThrow("not connected");
  });

  it("rejects subscribe() before a connection has been established", async () => {
    const client = new MqttJsClient(
      buildConfig({ MQTT_BROKER_URL: "mqtt://localhost:1883" }) as never,
    );

    await expect(client.subscribe("iot/+/+/telemetry", jest.fn())).rejects.toThrow("not connected");
  });

  it("dispatches an incoming message only to subscribers whose topic filter matches", async () => {
    const client = new MqttJsClient(
      buildConfig({ MQTT_BROKER_URL: "mqtt://localhost:1883" }) as never,
    );
    const connectPromise = client.connect();
    fakeClient.emit("connect");
    await connectPromise;

    const matched = jest.fn();
    const unmatched = jest.fn();
    await client.subscribe("iot/+/+/telemetry", matched);
    await client.subscribe("iot/+/+/status", unmatched);

    const payload = Buffer.from("23.5");
    fakeClient.emit("message", "iot/org1/device1/telemetry", payload);

    expect(matched).toHaveBeenCalledWith("iot/org1/device1/telemetry", payload);
    expect(unmatched).not.toHaveBeenCalled();
  });

  it("resolves disconnect() immediately when never connected", async () => {
    const client = new MqttJsClient(
      buildConfig({ MQTT_BROKER_URL: "mqtt://localhost:1883" }) as never,
    );

    await expect(client.disconnect()).resolves.toBeUndefined();
  });

  it("resolves disconnect() once the underlying client finishes ending", async () => {
    const client = new MqttJsClient(
      buildConfig({ MQTT_BROKER_URL: "mqtt://localhost:1883" }) as never,
    );
    const connectPromise = client.connect();
    fakeClient.emit("connect");
    await connectPromise;

    await expect(client.disconnect()).resolves.toBeUndefined();
    expect(fakeClient.end).toHaveBeenCalled();
  });
});
