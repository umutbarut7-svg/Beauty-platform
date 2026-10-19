import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GlobalizationModule } from "../globalization/globalization.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { MonetizationController } from "./monetization.controller.js";
import { MonetizationEngine } from "./monetization-engine.service.js";
import { MonetizationService } from "./monetization.service.js";
@Module({
  imports: [AuthModule, GlobalizationModule],
  controllers: [MonetizationController],
  providers: [MonetizationEngine, MonetizationService, ResourceIdPipe],
  exports: [MonetizationEngine, MonetizationService],
})
export class MonetizationModule {}
