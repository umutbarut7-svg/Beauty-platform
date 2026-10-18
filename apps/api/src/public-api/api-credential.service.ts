/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import {
  API_SCOPES,
  type ApiPrincipal,
  type ApiScope,
} from "./public-api.types.js";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
@Injectable()
export class ApiCredentialService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  async issue(clientId: string, expiresAt?: Date) {
    const client = await this.db.apiClient.findFirst({
      where: {
        id: clientId,
        status: "ACTIVE",
        application: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!client) throw new BadRequestException("API client not found");
    const id = `pk_${randomBytes(9).toString("base64url")}`,
      secret = randomBytes(32).toString("base64url"),
      raw = `${id}.${secret}`;
    const row = await this.db.apiCredential.create({
      data: {
        clientId,
        keyId: id,
        secretHash: hash(secret),
        fingerprint: hash(raw).slice(0, 16),
        expiresAt,
      },
    });
    return {
      id: row.id,
      apiKey: raw,
      fingerprint: row.fingerprint,
      expiresAt: row.expiresAt,
    };
  }
  async authenticate(raw: string): Promise<ApiPrincipal> {
    const [keyId, secret, ...rest] = raw.split(".");
    if (!keyId || !secret || rest.length)
      throw new UnauthorizedException("Invalid API credential");
    const credential = await this.db.apiCredential.findUnique({
      where: { keyId },
      include: {
        client: { include: { application: { include: { grants: true } } } },
      },
    });
    const supplied = Buffer.from(hash(secret), "hex"),
      stored = Buffer.from(credential?.secretHash ?? "", "hex");
    if (
      !credential ||
      stored.length !== supplied.length ||
      !timingSafeEqual(stored, supplied) ||
      credential.revokedAt ||
      (credential.expiresAt && credential.expiresAt <= new Date()) ||
      credential.client.status !== "ACTIVE" ||
      credential.client.application.status !== "ACTIVE"
    )
      throw new UnauthorizedException("Invalid or inactive API credential");
    await this.db.apiCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });
    const scopes = credential.client.application.grants.map(
      (x: any) => x.scope,
    );
    if (scopes.some((x: string) => !API_SCOPES.includes(x as ApiScope)))
      throw new ForbiddenException("Unknown scope grant");
    return {
      applicationId: credential.client.application.id,
      clientId: credential.client.id,
      credentialId: credential.id,
      businessId: credential.client.application.businessId,
      userId: credential.client.application.createdBy,
      scopes,
    };
  }
  assertScope(principal: ApiPrincipal, scope: ApiScope) {
    if (!API_SCOPES.includes(scope) || !principal.scopes.includes(scope))
      throw new ForbiddenException("Insufficient API scope");
  }
  revoke(credentialId: string) {
    return this.db.apiCredential.update({
      where: { id: credentialId },
      data: { revokedAt: new Date() },
    });
  }
}
