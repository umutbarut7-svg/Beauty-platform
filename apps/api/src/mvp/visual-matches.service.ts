/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  SemanticMatches,
  VisualMatchingStatus,
} from "@beauty-platform/types";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { SemanticService } from "./semantic.service.js";
import { VisualService } from "./visual.service.js";
import {
  compatibleVisualService,
  resolveVisualServiceKind,
} from "./visual-service-compatibility.js";
import type { HairServiceKind } from "./visual-service-compatibility.js";

type MatchingContext = { query: string; kind: HairServiceKind | null };

type MatchReference = {
  businessId: string;
  serviceId: string;
  similarity: number;
  sourceUpdatedAt: string;
  businessUpdatedAt: string;
};
type PublicService = {
  id: string;
  businessId: string;
  name: string;
  updatedAt: Date;
  business: { name: string; updatedAt: Date };
};

@Injectable()
export class VisualMatchesService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly visual: VisualService,
    private readonly semantic: SemanticService,
  ) {}

  private async locked<T>(
    user: AuthenticatedUser,
    id: string,
    action: (tx: PrismaService, context: MatchingContext) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `mvp-photo:${user.id}`,
      );
      const session = await this.visual.get(user, id, tx);
      if (session.status !== "PLAN")
        throw new BadRequestException("VISUAL_PLAN_REQUIRED");
      const request = await tx.mvpPhotoAnalysis.findFirst({
        where: {
          id,
          ownerId: user.id,
          status: "PLAN",
          expiresAt: { gt: new Date() },
        },
        select: { intent: true, target: true },
      });
      if (!request) throw new ConflictException("VISUAL_SESSION_CHANGED");
      const query = session.output.searchQuery;
      return action(tx, {
        query,
        kind: resolveVisualServiceKind(request.intent, request.target, query),
      });
    }) as Promise<T>;
  }

  private async project(
    tx: PrismaService,
    input: unknown,
    kind: HairServiceKind | null,
  ): Promise<SemanticMatches> {
    if (
      !Array.isArray(input) ||
      input.length > 20 ||
      input.some(
        (item) =>
          !item ||
          typeof item.businessId !== "string" ||
          typeof item.serviceId !== "string" ||
          typeof item.similarity !== "number" ||
          !Number.isFinite(item.similarity) ||
          typeof item.sourceUpdatedAt !== "string" ||
          typeof item.businessUpdatedAt !== "string",
      )
    )
      throw new ServiceUnavailableException("VISUAL_MATCH_UNAVAILABLE");
    const references = input as MatchReference[];
    if (!kind)
      return {
        provider: "OPENAI_PGVECTOR",
        status: "NO_MATCH",
        reason: "CONSULTATION_UNCLEAR",
        items: [],
      };
    const current: PublicService[] = references.length
      ? await tx.service.findMany({
          where: {
            OR: references.map(({ businessId, serviceId }) => ({
              businessId,
              id: serviceId,
            })),
            isActive: true,
            isBookable: true,
            business: { isPublic: true, status: "ACTIVE" },
          },
          select: {
            id: true,
            businessId: true,
            name: true,
            updatedAt: true,
            business: { select: { name: true, updatedAt: true } },
          },
        })
      : [];
    const items = references.flatMap((reference) => {
      const service = current.find(
        (item) =>
          item.id === reference.serviceId &&
          item.businessId === reference.businessId &&
          item.updatedAt.toISOString() === reference.sourceUpdatedAt &&
          item.business.updatedAt.toISOString() === reference.businessUpdatedAt,
      );
      return service && compatibleVisualService(kind, service.name)
        ? [
            {
              businessId: reference.businessId,
              serviceId: reference.serviceId,
              similarity: reference.similarity,
              businessName: service.business.name,
              serviceName: service.name,
            },
          ]
        : [];
    });
    return {
      provider: "OPENAI_PGVECTOR",
      status: items.length ? "MATCHED" : "NO_MATCH",
      items,
    };
  }

  get(user: AuthenticatedUser, id: string): Promise<VisualMatchingStatus> {
    return this.locked(user, id, async (tx, context) => {
      const row = await tx.mvpPhotoAnalysis.findUniqueOrThrow({
        where: { id },
        select: { matchingStatus: true, matchingOutput: true },
      });
      const status = row.matchingStatus ?? "NOT_REQUESTED";
      if (!["NOT_REQUESTED", "RUNNING", "READY", "FAILED"].includes(status))
        throw new ServiceUnavailableException("VISUAL_MATCH_UNAVAILABLE");
      return {
        status,
        result:
          status === "READY"
            ? await this.project(tx, row.matchingOutput, context.kind)
            : null,
      };
    });
  }

  async create(user: AuthenticatedUser, id: string): Promise<SemanticMatches> {
    const requestId = randomUUID();
    const claim = await this.locked(user, id, async (tx, context) => {
      const { query, kind } = context;
      const row = await tx.mvpPhotoAnalysis.findUniqueOrThrow({
        where: { id },
        select: { matchingStatus: true, matchingOutput: true },
      });
      if (row.matchingStatus === "READY")
        return { result: await this.project(tx, row.matchingOutput, kind), query };
      if (row.matchingStatus === "RUNNING")
        throw new ConflictException("VISUAL_MATCH_RUNNING");
      if (row.matchingStatus !== null && row.matchingStatus !== "FAILED")
        throw new ServiceUnavailableException("VISUAL_MATCH_UNAVAILABLE");
      if (!kind) {
        const completed = await tx.mvpPhotoAnalysis.updateMany({
          where: {
            id,
            ownerId: user.id,
            status: "PLAN",
            expiresAt: { gt: new Date() },
            matchingStatus: row.matchingStatus,
          },
          data: {
            matchingStatus: "READY",
            matchingOutput: [],
            matchingRequestId: null,
          },
        });
        if (completed.count !== 1)
          throw new ConflictException("VISUAL_SESSION_CHANGED");
        return { result: await this.project(tx, [], kind), query };
      }
      const claimed = await tx.mvpPhotoAnalysis.updateMany({
        where: {
          id,
          ownerId: user.id,
          status: "PLAN",
          expiresAt: { gt: new Date() },
          matchingStatus: row.matchingStatus,
        },
        data: {
          matchingStatus: "RUNNING",
          matchingRequestId: requestId,
          matchingOutput: null,
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException("VISUAL_SESSION_CHANGED");
      return { result: null, query };
    });
    if (claim.result) return claim.result;
    try {
      // Provider work happens outside the transaction and only after an explicit POST.
      const result = await this.semantic.search(user, claim.query);
      const references = result.items.map((item: MatchReference) => ({
        businessId: item.businessId,
        serviceId: item.serviceId,
        similarity: item.similarity,
        sourceUpdatedAt: new Date(item.sourceUpdatedAt).toISOString(),
        businessUpdatedAt: new Date(item.businessUpdatedAt).toISOString(),
      }));
      return await this.locked(user, id, async (tx, context) => {
        const projected = await this.project(tx, references, context.kind);
        const accepted = references.filter((reference) =>
          projected.items.some(
            (item) =>
              item.serviceId === reference.serviceId &&
              item.businessId === reference.businessId,
          ),
        );
        const saved = await tx.mvpPhotoAnalysis.updateMany({
          where: {
            id,
            ownerId: user.id,
            status: "PLAN",
            expiresAt: { gt: new Date() },
            matchingStatus: "RUNNING",
            matchingRequestId: requestId,
          },
          data: {
            matchingStatus: "READY",
            matchingOutput: accepted,
            matchingRequestId: null,
          },
        });
        if (saved.count !== 1)
          throw new ConflictException("VISUAL_SESSION_CHANGED");
        return projected;
      });
    } catch (error) {
      await this.db.mvpPhotoAnalysis.updateMany({
        where: {
          id,
          ownerId: user.id,
          matchingStatus: "RUNNING",
          matchingRequestId: requestId,
        },
        data: {
          matchingStatus: "FAILED",
          matchingRequestId: null,
          matchingOutput: null,
        },
      });
      throw error;
    }
  }
}

