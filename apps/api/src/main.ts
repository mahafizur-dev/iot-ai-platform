import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({ origin: config.getOrThrow<string>("CORS_ORIGIN") });
  app.setGlobalPrefix("api/v1", { exclude: ["health"] });

  const port = config.getOrThrow<number>("PORT");
  await app.listen(port);

  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();
