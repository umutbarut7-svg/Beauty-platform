import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ApiPrincipal, WebhookEnvelope } from "./public-api.types.js";
@Injectable()
export class WebhookService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  async validateUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException("Invalid webhook URL");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      ["localhost", "localhost.localdomain"].includes(
        url.hostname.toLowerCase(),
      )
    )
      throw new BadRequestException("Unsafe webhook URL");
    let addresses: { address: string }[];
    try {
      addresses = await lookup(url.hostname, { all: true });
    } catch {
      throw new BadRequestException("Webhook host cannot be resolved");
    }
    if (
      !addresses.length ||
      addresses.some((x) => this.privateAddress(x.address))
    )
      throw new BadRequestException("Unsafe webhook network target");
    return url.toString();
  }
  async create(principal: ApiPrincipal, url: string, events: string[]) {
    const normalized = await this.validateUrl(url),
      secret = randomBytes(32).toString("base64url"),
      encrypted = this.encrypt(secret);
    const endpoint = await this.db.webhookEndpoint.create({
      data: {
        applicationId: principal.applicationId,
        businessId: principal.businessId,
        url: normalized,
        events,
        secretHash: this.digest(secret),
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
      },
    });
    return {
      id: endpoint.id,
      url: endpoint.url,
      events: endpoint.events,
      signingSecret: secret,
    };
  }
  envelope(
    eventType: string,
    businessId: string,
    resource: { type: string; id: string },
    data: Record<string, unknown>,
  ): WebhookEnvelope {
    return {
      eventId: randomUUID(),
      eventType,
      version: 1,
      occurredAt: new Date().toISOString(),
      businessId,
      resource,
      data,
    };
  }
  sign(secret: string, timestamp: string, body: string) {
    return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  }
  verify(
    secret: string,
    timestamp: string,
    body: string,
    signature: string,
    toleranceSeconds = 300,
  ) {
    const age = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (!Number.isFinite(age) || age > toleranceSeconds * 1000) return false;
    const expected = this.sign(secret, timestamp, body),
      a = Buffer.from(expected),
      b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  nextAttempt(attempt: number, now = new Date()) {
    return new Date(
      now.getTime() + Math.min(3600, 2 ** Math.max(0, attempt) * 30) * 1000,
    );
  }
  async queue(endpointId: string, envelope: WebhookEnvelope) {
    const endpoint = await this.db.webhookEndpoint.findFirst({
      where: {
        id: endpointId,
        businessId: envelope.businessId,
        status: "ACTIVE",
      },
    });
    if (!endpoint || !endpoint.events.includes(envelope.eventType))
      throw new BadRequestException("Webhook endpoint unavailable");
    return this.db.webhookDelivery.create({
      data: {
        endpointId,
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        eventVersion: envelope.version,
        payload: envelope,
        status: "PENDING",
        nextAttemptAt: new Date(),
      },
    });
  }
  async recordAttempt(
    deliveryId: string,
    statusCode: number | null,
    errorCode: string | null,
  ) {
    return this.db.$transaction(async (tx: PrismaService) => {
      const delivery = await tx.webhookDelivery.findUnique({
        where: { id: deliveryId },
        include: { attempts: true },
      });
      if (!delivery) throw new BadRequestException("Delivery not found");
      const attemptNumber = delivery.attempts.length + 1;
      await tx.webhookAttempt.create({
        data: { deliveryId, attemptNumber, statusCode, errorCode },
      });
      return tx.webhookDelivery.update({
        where: { id: deliveryId },
        data:
          statusCode && statusCode >= 200 && statusCode < 300
            ? { status: "DELIVERED", deliveredAt: new Date() }
            : {
                status: attemptNumber >= 8 ? "FAILED" : "RETRYING",
                nextAttemptAt: this.nextAttempt(attemptNumber),
              },
      });
    });
  }
  private encrypt(secret: string) {
    const key = this.encryptionKey(),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv),
      ciphertext = Buffer.concat([
        cipher.update(secret, "utf8"),
        cipher.final(),
      ]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  }
  decrypt(row: {
    secretCiphertext: string;
    secretIv: string;
    secretTag: string;
  }) {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey(),
      Buffer.from(row.secretIv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(row.secretTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.secretCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
  private encryptionKey() {
    const raw = process.env.WEBHOOK_ENCRYPTION_KEY;
    if (!raw) throw new Error("WEBHOOK_ENCRYPTION_KEY is required");
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32)
      throw new Error("WEBHOOK_ENCRYPTION_KEY must be 32-byte base64");
    return key;
  }
  private digest(value: string) {
    return createHmac("sha256", this.encryptionKey())
      .update(value)
      .digest("hex");
  }
  private privateAddress(ip: string) {
    const x = ip.toLowerCase();
    if (
      x === "::1" ||
      x.startsWith("fe80:") ||
      x.startsWith("fc") ||
      x.startsWith("fd")
    )
      return true;
    const p = x.split(".").map(Number);
    return (
      p.length === 4 &&
      (p[0] === 10 ||
        p[0] === 127 ||
        p[0] === 0 ||
        (p[0] === 169 && p[1] === 254) ||
        (p[0] === 192 && p[1] === 168) ||
        (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31))
    );
  }
}
