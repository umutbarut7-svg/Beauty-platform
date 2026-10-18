import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { PRISMA_SERVICE } from "./database.tokens.js";

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: PRISMA_SERVICE, useExisting: PrismaService },
  ],
  exports: [PrismaService, PRISMA_SERVICE],
})
export class DatabaseModule {}
