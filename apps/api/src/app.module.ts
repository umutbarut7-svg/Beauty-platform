import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { RolesGuard } from "./auth/roles.guard.js";
import { BusinessesModule } from "./businesses/businesses.module.js";
import { CustomersModule } from "./customers/customers.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { AppointmentsModule } from "./appointments/appointments.module.js";
import { AutomationsModule } from "./automations/automations.module.js";
import { DiscoveryModule } from "./discovery/discovery.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { InfrastructureModule } from "./infrastructure/infrastructure.module.js";
import { loadRuntimeConfig } from "./infrastructure/config.js";
import { AiModule } from "./ai/ai.module.js";
import { BeautyDNAModule } from "./beauty-dna/beauty-dna.module.js";
import { ProfessionalIntelligenceModule } from "./professional-intelligence/professional-intelligence.module.js";
import { BusinessIntelligenceModule } from "./business-intelligence/business-intelligence.module.js";
import { PredictionsModule } from "./predictions/predictions.module.js";
import { MarketplaceLiquidityModule } from "./marketplace-liquidity/marketplace-liquidity.module.js";
import { PublicApiModule } from "./public-api/public-api.module.js";
import { CategoriesModule } from "./categories/categories.module.js";
import { GlobalizationModule } from "./globalization/globalization.module.js";
import { MonetizationModule } from "./monetization/monetization.module.js";
import { GrowthModule } from "./growth/growth.module.js";
import { GovernanceModule } from "./governance/governance.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BusinessesModule,
    CustomersModule,
    AppointmentsModule,
    AutomationsModule,
    NotificationsModule,
    DiscoveryModule,
    InfrastructureModule,
    AiModule,
    PredictionsModule,
    BeautyDNAModule,
    ProfessionalIntelligenceModule,
    BusinessIntelligenceModule,
    MarketplaceLiquidityModule,
    PublicApiModule,
    CategoriesModule,
    GlobalizationModule,
    MonetizationModule,
    GrowthModule,
    GovernanceModule,
    ThrottlerModule.forRootAsync({
      imports: [],
      useFactory: () => {
        const config = loadRuntimeConfig();
        return [
          {
            ttl: config.rateLimitWindowMs,
            limit: config.rateLimitDefault,
          },
        ];
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
