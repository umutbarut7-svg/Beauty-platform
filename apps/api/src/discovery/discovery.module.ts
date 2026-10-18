import { Module } from "@nestjs/common";
import { DatabaseSearchProvider } from "./database-search.provider.js";
import { DiscoveryController } from "./discovery.controller.js";
import { DiscoveryService } from "./discovery.service.js";
import { RankingService } from "./ranking.service.js";
import { AppointmentsModule } from "../appointments/appointments.module.js";
import { GeoService } from "./geo.service.js";
import { HistoricalExpertiseProvider } from "./expertise.service.js";
import { UnavailableResultProbabilityProvider } from "./result-probability.provider.js";
import { DiscoveryAvailabilityService } from "./discovery-availability.service.js";
@Module({
  imports: [AppointmentsModule],
  controllers: [DiscoveryController],
  providers: [
    DatabaseSearchProvider,
    GeoService,
    HistoricalExpertiseProvider,
    UnavailableResultProbabilityProvider,
    DiscoveryAvailabilityService,
    RankingService,
    DiscoveryService,
  ],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
