import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { B2BController } from "./b2b.controller.js";
import { B2BService } from "./b2b.service.js";
@Module({
  imports: [AuthModule],
  controllers: [B2BController],
  providers: [B2BService, ResourceIdPipe],
})
export class B2BModule {}
