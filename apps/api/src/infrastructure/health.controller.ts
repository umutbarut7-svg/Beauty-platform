/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Public } from "../auth/auth.decorators.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { MetricsService } from "./metrics.service.js";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly metrics: MetricsService,
  ) {}
  @Public()
  @Get()
  live() {
    return { status: "ok" as const };
  }
  @Public()
  @Get("ready")
  async ready() {
    try {
      await this.db.$queryRawUnsafe("SELECT 1");
      this.metrics.database();
      return { status: "ready" as const };
    } catch {
      this.metrics.database(true);
      this.metrics.dependencyFailure();
      throw new ServiceUnavailableException({ status: "unavailable" });
    }
  }
}
