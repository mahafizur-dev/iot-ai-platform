import * as Joi from "joi";

/**
 * Validated at boot (see docs/ARCHITECTURE.md §13) so the app fails fast on
 * missing/invalid configuration instead of surfacing errors later at random.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string().required(),
  CORS_ORIGIN: Joi.string().required(),

  // Auth (see docs/ARCHITECTURE.md §8): distinct secrets for access vs.
  // refresh tokens so a leaked access-token secret alone can't be used to
  // mint refresh tokens.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),

  // MQTT / telemetry ingestion (see docs/ARCHITECTURE.md §6).
  MQTT_BROKER_URL: Joi.string().required(),
  MQTT_USERNAME: Joi.string().optional(),
  MQTT_PASSWORD: Joi.string().optional(),
  REDIS_URL: Joi.string().required(),
  // Shared secret EMQX sends on every auth-hook call so a stray request can't
  // probe the device-credential-check oracle (see mqtt/mqtt-auth.controller.ts).
  EMQX_AUTH_HOOK_SECRET: Joi.string().min(16).required(),
  DEVICE_OFFLINE_THRESHOLD_SECONDS: Joi.number().positive().default(90),
});
