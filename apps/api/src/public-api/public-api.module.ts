import { Module } from "@nestjs/common";
import { CategoriesModule } from "../categories/categories.module.js";
import { GlobalizationModule } from "../globalization/globalization.module.js";
import { AppointmentsModule } from "../appointments/appointments.module.js";
import { DiscoveryModule } from "../discovery/discovery.module.js";
import { InfrastructureModule } from "../infrastructure/infrastructure.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { ApiCredentialService } from "./api-credential.service.js";
import { PublicApiRateLimitService } from "./public-api-rate-limit.service.js";
import { WebhookService } from "./webhook.service.js";
import { ExternalAiToolsService } from "./external-ai-tools.service.js";
import { PublicApiService } from "./public-api.service.js";
import { PublicApiCredentialGuard } from "./public-api.guard.js";
import { PublicApiUsageInterceptor } from "./public-api-usage.interceptor.js";
import { PublicApiController } from "./public-api.controller.js";
import { PublicContractController } from "./public-contract.controller.js";
import { DeveloperApplicationsService } from "./developer-applications.service.js";
import { DeveloperApplicationsController } from "./developer-applications.controller.js";
@Module({
  imports: [
    AppointmentsModule,
    DiscoveryModule,
    InfrastructureModule,
    CategoriesModule,
    GlobalizationModule,
  ],
  controllers: [
    PublicApiController,
    PublicContractController,
    DeveloperApplicationsController,
  ],
  providers: [
    ApiCredentialService,
    PublicApiRateLimitService,
    WebhookService,
    ExternalAiToolsService,
    PublicApiService,
    PublicApiCredentialGuard,
    PublicApiUsageInterceptor,
    DeveloperApplicationsService,
    ResourceIdPipe,
  ],
  exports: [ApiCredentialService, WebhookService, ExternalAiToolsService],
})
export class PublicApiModule {}
