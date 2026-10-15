/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
@Injectable()
export class PushDevicesService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  async register(
    u: AuthenticatedUser,
    b: string,
    d: { token: string; platform: string },
  ) {
    await this.permissions.assertBusinessAccess(u, b, "notification:read");
    const hash = this.hash(d.token);
    const encryptedToken = this.encrypt(d.token);
    return this.db.pushDevice.upsert({
      where: { businessId_tokenHash: { businessId: b, tokenHash: hash } },
      create: {
        businessId: b,
        userId: u.id,
        platform: d.platform,
        tokenHash: hash,
        encryptedToken,
        isActive: true,
      },
      update: {
        userId: u.id,
        platform: d.platform,
        encryptedToken,
        isActive: true,
        invalidatedAt: null,
        lastUsedAt: new Date(),
      },
    });
  }
  async list(u: AuthenticatedUser, b: string) {
    await this.permissions.assertBusinessAccess(u, b, "notification:read");
    return this.db.pushDevice.findMany({
      where: { businessId: b, userId: u.id },
      select: {
        id: true,
        platform: true,
        isActive: true,
        lastUsedAt: true,
        invalidatedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async revoke(u: AuthenticatedUser, b: string, id: string) {
    await this.permissions.assertBusinessAccess(u, b, "notification:read");
    const d = await this.db.pushDevice.findFirst({
      where: { id, businessId: b, userId: u.id },
    });
    if (!d) throw new NotFoundException("Push device not found");
    return this.db.pushDevice.update({
      where: { id },
      data: { isActive: false, invalidatedAt: new Date() },
    });
  }
  async invalidate(b: string, token: string) {
    return this.db.pushDevice.updateMany({
      where: { businessId: b, tokenHash: this.hash(token) },
      data: { isActive: false, invalidatedAt: new Date() },
    });
  }
  decrypt(value: string) {
    const key = this.key(),
      parts = value.split(".").map((x) => Buffer.from(x, "base64url"));
    if (parts.length !== 3)
      throw new BadRequestException("Invalid encrypted push token");
    const [iv, tag, data] = parts as [Buffer, Buffer, Buffer];
    const cipher = createDecipheriv("aes-256-gcm", key, iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString(
      "utf8",
    );
  }
  private encrypt(value: string) {
    const key = this.key(),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data]
      .map((x) => x.toString("base64url"))
      .join(".");
  }
  private hash(v: string) {
    return createHash("sha256").update(v).digest("hex");
  }
  private key() {
    const raw = process.env.PUSH_TOKEN_ENCRYPTION_KEY;
    if (!raw)
      throw new BadRequestException("Push token encryption is not configured");
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32)
      throw new BadRequestException(
        "PUSH_TOKEN_ENCRYPTION_KEY must decode to 32 bytes",
      );
    return key;
  }
}
