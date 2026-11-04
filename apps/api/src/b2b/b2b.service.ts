/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import type { PrismaService } from "../database/prisma.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { inventoryEnabled } from "../inventory/inventory-policy.js";
import type {
  B2BPageDto,
  QuotePageDto,
  QuoteReplyDto,
  QuoteRequestDto,
  SupplierProfileDto,
} from "./b2b.dto.js";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const supplierWhere = {
  isPublic: true,
  status: "ACTIVE" as const,
  supplierProfile: { isListed: true },
};
const quoteSelect = {
  id: true,
  buyerBusinessId: true,
  supplierBusinessId: true,
  productId: true,
  productName: true,
  sku: true,
  unit: true,
  quantity: true,
  buyerNote: true,
  supplierNote: true,
  status: true,
  quotedUnitPrice: true,
  currency: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
  buyer: { select: { name: true } },
  supplier: { select: { name: true } },
} as const;
@Injectable()
export class B2BService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  private async access(
    user: AuthenticatedUser,
    businessId: string,
    write = false,
  ) {
    if (process.env.MVP_B2B_ENABLED !== "true" || !inventoryEnabled())
      throw new ServiceUnavailableException("B2B_DISABLED");
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      write ? "b2b:manage" : "b2b:read",
    );
  }
  async profile(user: AuthenticatedUser, businessId: string) {
    await this.access(user, businessId);
    return this.db.supplierProfile.findUnique({ where: { businessId } });
  }
  async saveProfile(
    user: AuthenticatedUser,
    businessId: string,
    dto: SupplierProfileDto,
  ) {
    await this.access(user, businessId, true);
    if (dto.expectedRevision === null)
      throw new BadRequestException("Supplier revision cannot be null");
    if (
      dto.isListed &&
      !(await this.db.business.findFirst({
        where: { id: businessId, isPublic: true, status: "ACTIVE" },
        select: { id: true },
      }))
    )
      throw new BadRequestException("Publish an active business profile first");
    const { expectedRevision, ...data } = dto;
    const prior = await this.db.supplierProfile.findUnique({
      where: { businessId },
    });
    if (!prior) {
      if (expectedRevision !== undefined)
        throw new ConflictException("Supplier profile changed; reload");
      try {
        return await this.db.supplierProfile.create({
          data: { ...data, businessId },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ConflictException("Supplier profile changed; reload");
        throw error;
      }
    }
    if (expectedRevision === undefined)
      throw new ConflictException("Supplier revision is required");
    const updated = await this.db.supplierProfile.updateMany({
      where: { businessId, revision: expectedRevision },
      data: { ...data, revision: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new ConflictException("Supplier profile changed; reload");
    return { businessId };
  }
  async suppliers(
    user: AuthenticatedUser,
    businessId: string,
    page: B2BPageDto,
  ) {
    await this.access(user, businessId);
    const rows = await this.db.business.findMany({
      where: {
        ...supplierWhere,
        NOT: { id: businessId },
        ...(page.after ? { id: { gt: page.after } } : {}),
        ...(page.query?.trim()
          ? { name: { contains: page.query.trim(), mode: "insensitive" } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        isVerified: true,
        supplierProfile: { select: { kind: true, description: true } },
      },
      orderBy: { id: "asc" },
      take: 51,
    });
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  }
  async products(
    user: AuthenticatedUser,
    businessId: string,
    supplierId: string,
    page: B2BPageDto,
  ) {
    await this.access(user, businessId);
    if (
      supplierId === businessId ||
      !(await this.db.business.findFirst({
        where: { id: supplierId, ...supplierWhere },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Supplier not available");
    const rows = await this.db.catalogProduct.findMany({
      where: {
        businessId: supplierId,
        isActive: true,
        b2bAvailable: true,
        ...(page.after ? { id: { gt: page.after } } : {}),
      },
      select: {
        id: true,
        name: true,
        brand: true,
        sku: true,
        description: true,
        price: true,
        currency: true,
        unit: true,
      },
      orderBy: { id: "asc" },
      take: 51,
    });
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }
  async requestQuote(
    user: AuthenticatedUser,
    businessId: string,
    dto: QuoteRequestDto,
  ) {
    await this.access(user, businessId, true);
    if (dto.supplierBusinessId === businessId)
      throw new BadRequestException("A business cannot request its own quote");
    const quantity = new Prisma.Decimal(dto.quantity);
    if (!quantity.gt(0))
      throw new BadRequestException("Positive quantity required");
    const keyHash = digest(dto.idempotencyKey),
      requestHash = digest(
        JSON.stringify([
          user.id,
          dto.supplierBusinessId,
          dto.productId,
          quantity.toString(),
          dto.note.trim(),
        ]),
      );
    for (let attempt = 0; attempt < 5; attempt++)
      try {
        return await this.db.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const prior = await tx.b2BQuoteRequest.findUnique({
              where: {
                buyerBusinessId_keyHash: {
                  buyerBusinessId: businessId,
                  keyHash,
                },
              },
            });
            if (prior) {
              if (prior.requestHash !== requestHash)
                throw new ConflictException(
                  "Quote key reused with different input",
                );
              return { id: prior.id };
            }
            const product = await tx.catalogProduct.findFirst({
              where: {
                id: dto.productId,
                businessId: dto.supplierBusinessId,
                isActive: true,
                b2bAvailable: true,
                business: supplierWhere,
              },
            });
            if (!product)
              throw new NotFoundException("Supplier product not available");
            if (product.unit === "UNIT" && !quantity.isInteger())
              throw new BadRequestException("Whole unit quantity required");
            const quote = await tx.b2BQuoteRequest.create({
              data: {
                buyerBusinessId: businessId,
                supplierBusinessId: dto.supplierBusinessId,
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                unit: product.unit,
                quantity,
                buyerNote: dto.note.trim(),
                requestedBy: user.id,
                keyHash,
                requestHash,
              },
            });
            return { id: quote.id };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2034"].includes(error.code)
        ) {
          if (attempt < 4) continue;
          throw new ConflictException("Quote changed; retry with the same key");
        }
        throw error;
      }
    throw new ConflictException("Quote not completed");
  }
  async quotes(
    user: AuthenticatedUser,
    businessId: string,
    page: QuotePageDto,
  ) {
    await this.access(user, businessId);
    const rows = await this.db.b2BQuoteRequest.findMany({
      where: {
        ...(page.side === "BUYER"
          ? { buyerBusinessId: businessId }
          : { supplierBusinessId: businessId }),
        ...(page.after ? { id: { gt: page.after } } : {}),
      },
      select: quoteSelect,
      orderBy: { id: "asc" },
      take: 51,
    });
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }
  async reply(
    user: AuthenticatedUser,
    businessId: string,
    quoteId: string,
    dto: QuoteReplyDto,
  ) {
    await this.access(user, businessId, true);
    if (dto.action === "QUOTE" && (!dto.unitPrice || !dto.currency))
      throw new BadRequestException("Quote price and currency required");
    if (
      dto.action === "DECLINE" &&
      (dto.unitPrice !== undefined || dto.currency !== undefined)
    )
      throw new BadRequestException("Decline cannot set a price");
    if (
      !(await this.db.b2BQuoteRequest.findFirst({
        where: { id: quoteId, supplierBusinessId: businessId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Quote not found");
    const updated = await this.db.b2BQuoteRequest.updateMany({
      where: {
        id: quoteId,
        supplierBusinessId: businessId,
        status: "REQUESTED",
        revision: dto.expectedRevision,
      },
      data: {
        status: dto.action === "QUOTE" ? "QUOTED" : "DECLINED",
        quotedUnitPrice: dto.action === "QUOTE" ? dto.unitPrice : null,
        currency: dto.action === "QUOTE" ? dto.currency : null,
        supplierNote: dto.note.trim(),
        respondedBy: user.id,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new ConflictException("Quote changed or already answered");
    return { id: quoteId };
  }
  async cancel(
    user: AuthenticatedUser,
    businessId: string,
    quoteId: string,
    revision: number,
  ) {
    await this.access(user, businessId, true);
    if (
      !(await this.db.b2BQuoteRequest.findFirst({
        where: { id: quoteId, buyerBusinessId: businessId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Quote not found");
    const changed = await this.db.b2BQuoteRequest.updateMany({
      where: {
        id: quoteId,
        buyerBusinessId: businessId,
        revision,
        status: { in: ["REQUESTED", "QUOTED"] },
      },
      data: { status: "CANCELLED", revision: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new ConflictException("Quote changed or already closed");
    return { id: quoteId };
  }
}
