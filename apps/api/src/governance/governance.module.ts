import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { GovernanceController } from "./governance.controller.js";
import { GovernanceEngine } from "./governance-engine.service.js";
import { GovernanceService } from "./governance.service.js";
@Module({
  imports: [AuthModule],
  controllers: [GovernanceController],
  providers: [GovernanceEngine, GovernanceService, ResourceIdPipe],
  exports: [GovernanceEngine, GovernanceService],
})
export class GovernanceModule {}
