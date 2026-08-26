import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>("PORT");
  await app.listen(port);

  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();
