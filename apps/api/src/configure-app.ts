import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

/**
 * Shared between main.ts and e2e tests so both run the app with identical
 * middleware/pipes — a test suite that skips this would pass against a
 * server shape production never runs.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(cookieParser());
  app.enableCors({ origin: config.getOrThrow<string>("CORS_ORIGIN"), credentials: true });
  app.setGlobalPrefix("api/v1", { exclude: ["health", "mqtt/auth"] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
