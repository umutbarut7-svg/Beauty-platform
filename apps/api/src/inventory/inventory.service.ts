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
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type {
  AppointmentConsumptionDto,
  ImportProductsDto,
  StockMovementDto,
  UpdateProductDto,
} from "./inventory.dto.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
import { inventoryEnabled } from "./inventory-policy.js";
const MAX_STOCK = new Prisma.Decimal("999999999999.999");
const publicSelect = {
  id: true,
  sku: true,
  name: true,
  brand: true,
  description: true,
  price: true,
  currency: true,
  unit: true,
  stockQuantity: true,
} as const;

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  private enabled() {
    if (!inventoryEnabled())
      throw new ServiceUnavailableException("INVENTORY_DISABLED");
  }
  private async access(
    user: AuthenticatedUser,
    businessId: string,
    write = false,
  ) {
    this.enabled();
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      write ? "inventory:manage" : "inventory:read",
    );
  }
  async list(user: AuthenticatedUser, businessId: string, after?: string) {
    await this.access(user, businessId);
    const rows = await this.db.catalogProduct.findMany({
      where: { businessId, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" },
      take: 51,
    });
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }
  async publicCatalog(businessId: string, after?: string) {
    this.enabled();
    const business = await this.db.business.findFirst({
      where: { id: businessId, isPublic: true, status: "ACTIVE" },
      select: { id: true },
    });
    if (!business) throw new NotFoundException("Catalog unavailable");
    const rows = await this.db.catalogProduct.findMany({
      where: {
        businessId,
        isActive: true,
        isPublic: true,
        ...(after ? { id: { gt: after } } : {}),
      },
      select: publicSelect,
      orderBy: { id: "asc" },
      take: 51,
    });
    const items = rows.slice(0, 50).map(({ stockQuantity, ...product }) => ({
      ...product,
      availability: stockQuantity.gt(0) ? "IN_STOCK" : "OUT_OF_STOCK",
    }));
    return { items, nextCursor: rows.length > 50 ? rows[49]!.id : null };
  }
  private quantity(value: string, unit: string) {
    const quantity = new Prisma.Decimal(value);
    if (
      quantity.lt(0) ||
      quantity.gt(MAX_STOCK) ||
      (unit === "UNIT" && !quantity.isInteger())
    )
      throw new BadRequestException("Invalid stock quantity for unit");
    return quantity;
  }
  // The operation receipt and all writes commit together. Unique key/serialization
  // races retry the transaction; callers receive exactly the stored receipt.
  private async operation(
    user: AuthenticatedUser,
    businessId: string,
    key: string,
    type: string,
    payload: unknown,
    action: (
      tx: Prisma.TransactionClient,
      operationId: string,
    ) => Promise<Prisma.InputJsonValue>,
    authorize?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const keyHash = digest(key),
      requestHash = digest(JSON.stringify([user.id, type, payload]));
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx: Prisma.TransactionClient) => {
            await authorize?.(tx);
            const prior = await tx.inventoryOperation.findUnique({
              where: { businessId_keyHash: { businessId, keyHash } },
            });
            if (prior) {
              if (prior.requestHash !== requestHash)
                throw new ConflictException(
                  "Operation key reused with different input",
                );
              return prior.response;
            }
            const operation = await tx.inventoryOperation.create({
              data: {
                businessId,
                keyHash,
                requestHash,
                actorId: user.id,
                type,
                response: {},
              },
            });
            const response = await action(tx, operation.id);
            await tx.inventoryOperation.update({
              where: { id: operation.id },
              data: { response },
            });
            return response;
          },
          { isolationLevel: "Serializable", timeout: 15000 },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2034"].includes(error.code)
        ) {
          if (attempt < 4) continue;
          throw new ConflictException(
            "Concurrent inventory change; reload and retry with the same key",
          );
        }
        throw error;
      }
    }
    throw new ConflictException("Inventory operation not completed");
  }
  async importProducts(
    user: AuthenticatedUser,
    businessId: string,
    dto: ImportProductsDto,
  ) {
    await this.access(user, businessId, true);
    const products = dto.products.map((p) => ({
      ...p,
      sku: p.sku.toUpperCase(),
      name: p.name.trim(),
      brand: p.brand?.trim(),
      description: p.description?.trim(),
      price: new Prisma.Decimal(p.price).toFixed(2),
      lowStockThreshold: this.quantity(p.lowStockThreshold, p.unit).toString(),
      isPublic: p.isPublic ?? false,
    }));
    if (
      products.some((p) => !p.name) ||
      new Set(products.map((p) => p.sku)).size !== products.length
    )
      throw new BadRequestException("Blank name or duplicate SKU in batch");
    return this.operation(
      user,
      businessId,
      dto.idempotencyKey,
      "IMPORT",
      products,
      async (tx) => {
        const existing = await tx.catalogProduct.count({
          where: { businessId, sku: { in: products.map((p) => p.sku) } },
        });
        if (existing)
          throw new ConflictException(
            "SKU already exists; no products were imported",
          );
        const ids: string[] = [];
        for (const product of products) {
          const created = await tx.catalogProduct.create({
            data: { ...product, businessId },
          });
          ids.push(created.id);
        }
        return { ids };
      },
    );
  }
  async update(
    user: AuthenticatedUser,
    businessId: string,
    productId: string,
    dto: UpdateProductDto,
  ) {
    await this.access(user, businessId, true);
    if (Object.values(dto).some((value) => value === null))
      throw new BadRequestException("Product fields cannot be null");
    const product = await this.db.catalogProduct.findFirst({
      where: { id: productId, businessId },
    });
    if (!product) throw new NotFoundException("Product not found");
    const { expectedRevision, ...data } = dto;
    if (data.name !== undefined && !data.name.trim())
      throw new BadRequestException("Product name is required");
    if (data.lowStockThreshold !== undefined)
      this.quantity(data.lowStockThreshold, product.unit);
    const changed = await this.db.catalogProduct.updateMany({
      where: { id: productId, businessId, revision: expectedRevision },
      data: {
        ...data,
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        revision: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new ConflictException("Product changed; reload before saving");
    return { id: productId };
  }
  async move(
    user: AuthenticatedUser,
    businessId: string,
    productId: string,
    dto: StockMovementDto,
  ) {
    await this.access(user, businessId, true);
    const payload = {
      productId,
      direction: dto.direction,
      quantity: new Prisma.Decimal(dto.quantity).toString(),
      reason: dto.reason.trim(),
    };
    if (!payload.reason)
      throw new BadRequestException("Movement reason is required");
    return this.operation(
      user,
      businessId,
      dto.idempotencyKey,
      "MOVEMENT",
      payload,
      async (tx, operationId) => {
        const product = await tx.catalogProduct.findFirst({
          where: { id: productId, businessId },
        });
        if (!product) throw new NotFoundException("Product not found");
        const quantity = this.quantity(payload.quantity, product.unit);
        if (!quantity.gt(0))
          throw new BadRequestException("Movement quantity must be positive");
        const after =
          payload.direction === "IN"
            ? product.stockQuantity.plus(quantity)
            : product.stockQuantity.minus(quantity);
        if (after.lt(0) || after.gt(MAX_STOCK))
          throw new ConflictException(
            "Insufficient stock or stock limit exceeded",
          );
        const changed = await tx.catalogProduct.updateMany({
          where: { id: productId, businessId, revision: product.revision },
          data: { stockQuantity: after, revision: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            "Stock changed; retry with the same operation key",
          );
        const movement = await tx.inventoryMovement.create({
          data: {
            businessId,
            productId,
            operationId,
            direction: payload.direction,
            quantity,
            quantityAfter: after,
            reason: payload.reason,
          },
        });
        return {
          movementId: movement.id,
          productId,
          quantityAfter: after.toString(),
          unit: product.unit,
        };
      },
    );
  }

  // Internal NUL-separated keys cannot collide with validated manual movement
  // keys. One permanent parent receipt per appointment prevents duplicate use
  // across devices, retries, new client keys and later application sessions.
  private consumptionKey(appointmentId: string) {
    return `appointment-consumption\0${appointmentId}`;
  }
  private async consumptionAccess(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
    write: boolean,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      write ? "inventory:manage" : "inventory:read",
      tx,
    );
    const appointment = await tx.appointment.findFirst({
      where: { id: appointmentId, businessId },
      select: {
        id: true,
        status: true,
        serviceId: true,
        service: { select: { name: true } },
      },
    });
    if (!appointment) throw new NotFoundException("Appointment not found");
    return appointment;
  }
  async consumption(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
  ) {
    this.enabled();
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.consumptionAccess(tx, user, businessId, appointmentId, false);
      const receipt = await tx.inventoryOperation.findUnique({
        where: {
          businessId_keyHash: {
            businessId,
            keyHash: digest(this.consumptionKey(appointmentId)),
          },
        },
      });
      return {
        consumption:
          receipt?.type === "APPOINTMENT_CONSUMPTION" ? receipt.response : null,
      };
    });
  }
  async consume(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
    dto: AppointmentConsumptionDto,
  ) {
    await this.access(user, businessId, true);
    const payload = {
      appointmentId,
      reason: dto.reason.trim(),
      items: dto.items
        .map((item) => ({
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantity).toString(),
        }))
        .sort((a, b) => a.productId.localeCompare(b.productId, "en")),
    };
    if (
      !payload.reason ||
      new Set(payload.items.map((item) => item.productId)).size !==
        payload.items.length
    )
      throw new BadRequestException(
        "Reason required; use each product only once",
      );
    return this.operation(
      user,
      businessId,
      this.consumptionKey(appointmentId),
      "APPOINTMENT_CONSUMPTION",
      payload,
      async (tx, parentOperationId) => {
        const appointment = await this.consumptionAccess(
          tx,
          user,
          businessId,
          appointmentId,
          true,
        );
        if (appointment.status !== "COMPLETED")
          throw new ConflictException(
            "Only completed appointments can record material use",
          );
        const items: Prisma.InputJsonValue[] = [];
        const createdAt = new Date().toISOString();
        for (const item of payload.items) {
          const product = await tx.catalogProduct.findFirst({
            where: { id: item.productId, businessId, isActive: true },
          });
          if (!product) throw new NotFoundException("Active product not found");
          const quantity = this.quantity(item.quantity, product.unit);
          if (!quantity.gt(0))
            throw new BadRequestException("Material quantity must be positive");
          const after = product.stockQuantity.minus(quantity);
          if (after.lt(0))
            throw new ConflictException(
              "Insufficient stock; no materials were recorded",
            );
          const changed = await tx.catalogProduct.updateMany({
            where: { id: product.id, businessId, revision: product.revision },
            data: { stockQuantity: after, revision: { increment: 1 } },
          });
          if (changed.count !== 1)
            throw new ConflictException(
              "Stock changed; reload before confirming",
            );
          // Preserve the existing one-operation/one-movement schema. Child
          // operations and the parent receipt commit in the SAME transaction.
          const child = await tx.inventoryOperation.create({
            data: {
              businessId,
              actorId: user.id,
              type: "APPOINTMENT_MATERIAL",
              keyHash: digest(
                `appointment-material\0${appointmentId}\0${product.id}`,
              ),
              requestHash: digest(JSON.stringify([parentOperationId, item])),
              response: {},
            },
          });
          const movement = await tx.inventoryMovement.create({
            data: {
              businessId,
              productId: product.id,
              operationId: child.id,
              direction: "OUT",
              quantity,
              quantityAfter: after,
              reason: payload.reason,
            },
          });
          const line = {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unit: product.unit,
            quantity: quantity.toString(),
            quantityAfter: after.toString(),
            movementId: movement.id,
          };
          items.push(line);
          await tx.inventoryOperation.update({
            where: { id: child.id },
            data: {
              response: {
                ...line,
                appointmentId,
                serviceId: appointment.serviceId,
                serviceName: appointment.service.name,
                parentOperationId,
              },
            },
          });
        }
        return {
          appointmentId,
          serviceId: appointment.serviceId,
          serviceName: appointment.service.name,
          operationId: parentOperationId,
          reason: payload.reason,
          createdAt,
          items,
        };
      },
      async (tx) => {
        await this.consumptionAccess(tx, user, businessId, appointmentId, true);
      },
    );
  }
  async history(
    user: AuthenticatedUser,
    businessId: string,
    productId: string,
  ) {
    await this.access(user, businessId);
    if (
      !(await this.db.catalogProduct.findFirst({
        where: { id: productId, businessId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Product not found");
    const movements = await this.db.inventoryMovement.findMany({
      where: { businessId, productId },
      select: {
        id: true,
        direction: true,
        quantity: true,
        quantityAfter: true,
        reason: true,
        createdAt: true,
        operation: { select: { type: true, response: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return movements.map(({ operation, ...movement }) => {
      const snapshot = operation.response as Record<
        string,
        Prisma.JsonValue
      > | null;
      return {
        ...movement,
        ...(operation.type === "APPOINTMENT_MATERIAL" &&
        snapshot &&
        typeof snapshot.appointmentId === "string" &&
        typeof snapshot.serviceName === "string"
          ? {
              appointmentId: snapshot.appointmentId,
              serviceName: snapshot.serviceName,
            }
          : {}),
      };
    });
  }
}
