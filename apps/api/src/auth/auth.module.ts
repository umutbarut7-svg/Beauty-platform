import { AccountErasureService } from "./account-erasure.service.js";
import { AccountDeletionController } from "./account-deletion.controller.js";
import { AccountDeletionService } from "./account-deletion.service.js";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PermissionsService } from "./permissions.service.js";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AccountDeletionController],
  providers: [
    AuthService,
    PermissionsService,
    AccountDeletionService,
    AccountErasureService,
  ],
  exports: [PermissionsService, JwtModule],
})
export class AuthModule {}
