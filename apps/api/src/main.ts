import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";
import { RedisIoAdapter } from "./realtime/redis-io.adapter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = app.get(ConfigService);

  // Redis-backed WS adapter so telemetry ingested on one API instance reaches
  // browser sockets connected to another (docs/ARCHITECTURE.md §7). Installed
  // here rather than in configure-app.ts because e2e tests run the app without
  // a listening socket server and don't need cross-instance fan-out.
  const redisIoAdapter = new RedisIoAdapter(
    app,
    config.getOrThrow<string>("REDIS_URL"),
    config.getOrThrow<string>("CORS_ORIGIN"),
  );
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = config.getOrThrow<number>("PORT");
  await app.listen(port);

  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();
