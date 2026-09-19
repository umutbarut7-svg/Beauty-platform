import { Controller, Get } from "@nestjs/common";
import { createHealthStatus, type HealthStatus } from "@beauty-platform/types";

@Controller()
export class AppController {
  @Get("health")
  getHealth(): HealthStatus {
    return createHealthStatus("api");
  }
}
