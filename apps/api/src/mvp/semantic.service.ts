/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PermissionsService } from "../auth/permissions.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import {
  BackgroundJobsService,
  type ClaimedJob,
} from "../infrastructure/background-jobs.service.js";
import { RedisWakeupService } from "../infrastructure/redis-wakeup.service.js";
import {
  OpenAiBeautyProvider,
  validateEmbedding,
} from "./providers/openai-beauty.provider.js";
import {
  assertMvpEnabled,
  embeddingModel,
} from "./providers/provider-config.js";
import { MvpExternalGuard } from "./visual.service.js";

@Injectable()
export class SemanticService implements OnModuleInit {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly ai: OpenAiBeautyProvider,
    private readonly guard: MvpExternalGuard,
    private readonly jobs: BackgroundJobsService,
    private readonly wakeup: RedisWakeupService,
  ) {}
  onModuleInit() {
    this.jobs.register("MVP_CATALOG_EMBED_V1", (job) => this.index(job));
  }
  private enabled() {
    assertMvpEnabled();
    if (process.env.MVP_SEMANTIC_ENABLED !== "true")
      throw new ServiceUnavailableException("SEMANTIC_MATCH_UNAVAILABLE");
    return embeddingModel();
  }
  async enqueue(
    user: AuthenticatedUser,
    businessId: string,
    serviceId: string,
    key: string,
  ) {
    this.enabled();
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service:update",
    );
    const service = await this.catalogService(businessId, serviceId);
    if (!service) throw new NotFoundException("PUBLIC_SERVICE_UNAVAILABLE");
    const job = await this.jobs.enqueue({
      businessId,
      type: "MVP_CATALOG_EMBED_V1",
      actorId: user.id,
      payload: { serviceId },
      idempotencyKey: key,
      maxAttempts: 1,
    });
    await this.wakeup.notify();
    return { status: job.status, jobId: job.id };
  }
  private catalogService(businessId: string, serviceId: string) {
    return this.db.service.findFirst({
      where: {
        id: serviceId,
        businessId,
        isActive: true,
        isBookable: true,
        business: { isPublic: true, status: "ACTIVE" },
      },
      select: {
        id: true,
        name: true,
        description: true,
        updatedAt: true,
        business: { select: { name: true, updatedAt: true } },
      },
    });
  }
  async index(job: ClaimedJob) {
    const model = this.enabled();
    const payload = job.payload as { serviceId?: unknown } | null;
    if (!job.actorId || typeof payload?.serviceId !== "string")
      throw new Error("InvalidCatalogIndexJob");
    const user = await this.db.user.findUnique({
      where: { id: job.actorId },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new Error("CatalogIndexAuthorizationDenied");
    await this.permissions.assertBusinessAccess(
      user,
      job.businessId,
      "service:update",
    );
    const source = await this.catalogService(job.businessId, payload.serviceId);
    if (!source) throw new Error("PublicCatalogSourceUnavailable");
    const existing = await this.db.$queryRawUnsafe(
      'SELECT 1 FROM "MvpCatalogVector" WHERE "serviceId"=$1 AND "businessId"=$2 AND model=$3 AND "sourceUpdatedAt"=$4 AND "businessUpdatedAt"=$5',
      source.id,
      job.businessId,
      model,
      source.updatedAt,
      source.business.updatedAt,
    );
    if (existing.length) return;
    const input = [source.business.name, source.name, source.description ?? ""]
      .join("\n")
      .slice(0, 4000);
    await this.guard.consume(user.id, input, "MVP_SEMANTIC");
    const result = await this.ai.embed(input);
    await this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `mvp-index:${job.businessId}:${source.id}`,
      );
      const stillAuthorized = await tx.businessMember.findUnique({
        where: {
          userId_businessId: { userId: user.id, businessId: job.businessId },
        },
      });
      if (
        user.role !== "SUPER_ADMIN" &&
        (!stillAuthorized || stillAuthorized.role === "STAFF")
      )
        throw new Error("CatalogIndexAuthorizationDenied");
      const indexed = await tx.$queryRawUnsafe(
        `INSERT INTO "MvpCatalogVector" ("serviceId","businessId",model,embedding,"sourceUpdatedAt","businessUpdatedAt","indexedAt")
        SELECT s.id,s."businessId",$3,$4::vector,s."updatedAt",b."updatedAt",CURRENT_TIMESTAMP
        FROM "Service" s JOIN "Business" b ON b.id=s."businessId"
        WHERE s.id=$1 AND s."businessId"=$2 AND s."updatedAt"=$5 AND b."updatedAt"=$6 AND s."isActive" AND s."isBookable" AND b."isPublic" AND b.status='ACTIVE'
        ON CONFLICT ("serviceId",model) DO UPDATE SET embedding=EXCLUDED.embedding,"sourceUpdatedAt"=EXCLUDED."sourceUpdatedAt","businessUpdatedAt"=EXCLUDED."businessUpdatedAt","indexedAt"=EXCLUDED."indexedAt"
        RETURNING "serviceId"`,
        source.id,
        job.businessId,
        result.model,
        JSON.stringify(validateEmbedding(result.vector)),
        source.updatedAt,
        source.business.updatedAt,
      );
      if (indexed.length !== 1) throw new Error("CatalogSourceChanged");
      await tx.auditLog.create({
        data: {
          businessId: job.businessId,
          actorId: user.id,
          actorType: "WORKER",
          action: "mvp.catalog.indexed",
          resourceType: "Service",
          resourceId: source.id,
          correlationId: job.correlationId,
          metadata: {
            model,
            inputHash: createHash("sha256").update(input).digest("hex"),
          },
          result: "SUCCEEDED",
        },
      });
    });
  }
  async search(user: AuthenticatedUser, query: string) {
    const model = this.enabled();
    await this.guard.consume(user.id, query, "MVP_SEMANTIC");
    const { vector } = await this.ai.embed(query);
    return this.nearest(vector, model);
  }
  async businessSearch(
    user: AuthenticatedUser,
    businessId: string,
    query: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service:update",
    );
    return this.search(user, query);
  }
  async nearest(vector: number[], model: string) {
    const embedding = JSON.stringify(validateEmbedding(vector));
    try {
      const items = await this.db.$queryRawUnsafe(
        `SELECT v."businessId",v."serviceId",v."sourceUpdatedAt",v."businessUpdatedAt",b.name AS "businessName",s.name AS "serviceName",1-(v.embedding <=> $1::vector) AS similarity
        FROM "MvpCatalogVector" v JOIN "Service" s ON s.id=v."serviceId" AND s."businessId"=v."businessId" JOIN "Business" b ON b.id=v."businessId"
        WHERE v.model=$2 AND b."isPublic" AND b.status='ACTIVE' AND s."isActive" AND s."isBookable" AND s."updatedAt"=v."sourceUpdatedAt" AND b."updatedAt"=v."businessUpdatedAt"
        ORDER BY v.embedding <=> $1::vector,v."serviceId" LIMIT 20`,
        embedding,
        model,
      );
      return {
        provider: "OPENAI_PGVECTOR",
        status: items.length ? "MATCHED" : "NO_MATCH",
        items,
      };
    } catch {
      throw new ServiceUnavailableException("SEMANTIC_INDEX_UNAVAILABLE");
    }
  }
}
