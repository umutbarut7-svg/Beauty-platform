/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators.js";
import {
  DiscoveryIntentDto,
  DiscoverySearchQueryDto,
} from "./discovery.dto.js";
import { DiscoveryService } from "./discovery.service.js";
@Controller("discovery")
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("search")
  search(@Query() query: DiscoverySearchQueryDto) {
    return this.discovery.search(query);
  }
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("businesses")
  businesses(@Query() query: DiscoverySearchQueryDto) {
    return this.discovery.search({ ...query, entityType: "BUSINESS" });
  }
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("services")
  services(@Query() query: DiscoverySearchQueryDto) {
    return this.discovery.search({ ...query, entityType: "SERVICE" });
  }
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("professionals")
  professionals(@Query() query: DiscoverySearchQueryDto) {
    return this.discovery.search({ ...query, entityType: "PROFESSIONAL" });
  }
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("match")
  match(@Body() intent: DiscoveryIntentDto) {
    return this.discovery.match(intent);
  }
}
