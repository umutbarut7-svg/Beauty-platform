import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { BackgroundJobsService } from "./infrastructure/background-jobs.service.js";
import { loadRuntimeConfig } from "./infrastructure/config.js";
import { RedisWakeupService } from "./infrastructure/redis-wakeup.service.js";
import { PhotoMaintenanceService } from "./mvp/photo-maintenance.service.js";
async function main() {
  loadRuntimeConfig();
  const cleanupOnly = process.argv.includes("--privacy-cleanup");
  if (process.env.STAGE33_MVP_ENABLED !== "true" && !cleanupOnly)
    throw new Error("MVP_FEATURE_DISABLED");
  const app = await NestFactory.createApplicationContext(AppModule);
  const jobs = app.get(BackgroundJobsService);
  const wakeup = app.get(RedisWakeupService);
  const maintenance = app.get(PhotoMaintenanceService);
  let stopping = false;
  const stop = () => {
    stopping = true;
    jobs.onModuleDestroy();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    do {
      await maintenance.sweep();
      const processed = cleanupOnly ? false : await jobs.processNext(true);
      if (process.argv.includes("--once")) break;
      if (!processed) await wakeup.wait();
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
