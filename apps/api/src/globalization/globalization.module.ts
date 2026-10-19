import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { GlobalizationController } from "./globalization.controller.js";
import { GlobalizationEngine } from "./globalization-engine.service.js";
import { GlobalizationService } from "./globalization.service.js";
@Module({
  imports: [AuthModule],
  controllers: [GlobalizationController],
  providers: [GlobalizationEngine, GlobalizationService, ResourceIdPipe],
  exports: [GlobalizationEngine, GlobalizationService],
})
export class GlobalizationModule {}
