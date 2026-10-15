import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { GlobalizationModule } from "../globalization/globalization.module.js";
import { MonetizationModule } from "../monetization/monetization.module.js";
import { GrowthController } from "./growth.controller.js";
import { GrowthEngine } from "./growth-engine.service.js";
import { GrowthService } from "./growth.service.js";
@Module({
  imports: [AuthModule, GlobalizationModule, MonetizationModule],
  controllers: [GrowthController],
  providers: [GrowthEngine, GrowthService, ResourceIdPipe],
  exports: [GrowthEngine, GrowthService],
})
export class GrowthModule {}
