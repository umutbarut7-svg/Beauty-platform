import { Module } from "@nestjs/common";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { MarketplaceLiquidityController } from "./marketplace-liquidity.controller.js";
import { MarketplaceLiquidityEngine } from "./marketplace-liquidity.engine.js";
import { MarketplaceLiquidityService } from "./marketplace-liquidity.service.js";
@Module({
  controllers: [MarketplaceLiquidityController],
  providers: [
    MarketplaceLiquidityEngine,
    MarketplaceLiquidityService,
    ResourceIdPipe,
  ],
  exports: [MarketplaceLiquidityEngine, MarketplaceLiquidityService],
})
export class MarketplaceLiquidityModule {}
