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
});
