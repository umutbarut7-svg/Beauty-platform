import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AppointmentsModule } from "../appointments/appointments.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { MvpController } from "./mvp.controller.js";
import { MvpService } from "./mvp.service.js";
import { PassportWorker } from "./passport-worker.service.js";
@Module({
  imports: [AuthModule, AppointmentsModule],
  controllers: [MvpController],
  providers: [MvpService, ResourceIdPipe, PassportWorker],
})
export class MvpModule {}
