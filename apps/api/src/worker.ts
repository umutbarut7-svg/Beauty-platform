import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { BackgroundJobsService } from "./infrastructure/background-jobs.service.js";
import { loadRuntimeConfig } from "./infrastructure/config.js";
async function main() {
  loadRuntimeConfig();
  if (process.env.STAGE33_MVP_ENABLED !== "true")
    throw new Error("MVP_FEATURE_DISABLED");
  const app = await NestFactory.createApplicationContext(AppModule);
  const jobs = app.get(BackgroundJobsService);
  let stopping = false;
  const stop = () => {
    stopping = true;
    jobs.onModuleDestroy();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    do {
      const processed = await jobs.processNext(true);
      if (process.argv.includes("--once")) break;
      if (!processed) await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (!stopping);
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    await app.close();
  }
}
void main().catch(() => {
  console.error("Worker startup or processing failed");
  process.exitCode = 1;
});
