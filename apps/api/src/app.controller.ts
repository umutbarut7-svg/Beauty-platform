import { Controller, Get } from "@nestjs/common";
import { createHealthStatus, type HealthStatus } from "@beauty-platform/types";
import { Public } from "./auth/auth.decorators.js";

@Controller()
export class AppController {
  @Public()
  @Get("health")
  getHealth(): HealthStatus {
    return createHealthStatus("api");
  }
}
