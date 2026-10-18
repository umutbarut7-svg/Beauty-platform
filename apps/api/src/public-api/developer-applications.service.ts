/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { API_SCOPES, type ApiScope } from "./public-api.types.js";
import { ApiCredentialService } from "./api-credential.service.js";
@Injectable()
export class DeveloperApplicationsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly credentials: ApiCredentialService,
  ) {}
  async create(
    user: AuthenticatedUser,
    businessId: string,
    name: string,
    scopes: string[],
  ) {
    await this.authorize(user, businessId);
    if (scopes.some((x) => !API_SCOPES.includes(x as ApiScope)))
      throw new ForbiddenException("Unknown API scope");
    return this.db.$transaction(async (tx: PrismaService) => {
      const app = await tx.apiApplication.create({
        data: { businessId, name, createdBy: user.id },
      });
      for (const scope of [...new Set(scopes)])
        await tx.apiGrant.create({ data: { applicationId: app.id, scope } });
      const client = await tx.apiClient.create({
        data: { applicationId: app.id, name: "default" },
      });
      return {
        applicationId: app.id,
        clientId: client.id,
        name: app.name,
        scopes,
      };
    });
  }
  async issue(
    user: AuthenticatedUser,
    businessId: string,
    clientId: string,
    expiresAt?: Date,
  ) {
    await this.authorize(user, businessId);
    const client = await this.db.apiClient.findFirst({
      where: { id: clientId, application: { businessId } },
      select: { id: true },
    });
    if (!client) throw new ForbiddenException("API client access denied");
    await this.db.apiCredential.updateMany({
      where: { clientId: client.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.credentials.issue(client.id, expiresAt);
  }
  private async authorize(user: AuthenticatedUser, businessId: string) {
    if (user.role === "SUPER_ADMIN") return;
    const member = await this.db.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { role: true },
    });
    if (!member || member.role === "STAFF")
      throw new ForbiddenException("Integration management denied");
  }
}
