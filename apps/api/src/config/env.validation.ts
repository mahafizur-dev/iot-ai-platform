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
});
