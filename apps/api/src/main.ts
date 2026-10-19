import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { requiredSecret } from "./auth/auth.service.js";
import { loadRuntimeConfig } from "./infrastructure/config.js";

async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig();
  requiredSecret("JWT_ACCESS_SECRET");
  requiredSecret("JWT_REFRESH_SECRET");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: config.trustProxy }),
  );
  app.enableShutdownHooks(["SIGTERM", "SIGINT"]);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });
  await app.listen(config.port, "0.0.0.0");
}

void bootstrap();
