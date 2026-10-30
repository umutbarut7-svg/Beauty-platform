import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AppointmentsModule } from "../appointments/appointments.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { MvpController } from "./mvp.controller.js";
import { MvpService } from "./mvp.service.js";
import { PassportWorker } from "./passport-worker.service.js";
import { VisualController } from "./visual.controller.js";
import { MvpExternalGuard, VisualService } from "./visual.service.js";
import { SemanticService } from "./semantic.service.js";
import { VisualMatchesService } from "./visual-matches.service.js";
import { VerificationService } from "./verification.service.js";
import { PrivatePhotoStore } from "./providers/private-photo-store.js";
import { OpenAiBeautyProvider } from "./providers/openai-beauty.provider.js";
import { PhotoMaintenanceService } from "./photo-maintenance.service.js";
import { AISafetyEngine } from "../ai/ai-safety.service.js";
@Module({
  imports: [AuthModule, AppointmentsModule],
  controllers: [MvpController, VisualController],
  providers: [
    MvpService,
    ResourceIdPipe,
    PassportWorker,
    VisualService,
    MvpExternalGuard,
    SemanticService,
    VisualMatchesService,
    VerificationService,
    PrivatePhotoStore,
    OpenAiBeautyProvider,
    PhotoMaintenanceService,
    AISafetyEngine,
  ],
})
export class MvpModule {}
