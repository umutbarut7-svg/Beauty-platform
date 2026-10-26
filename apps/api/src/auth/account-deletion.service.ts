import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { compare } from "bcryptjs";
import type { PrismaService } from "../database/prisma.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";

@Injectable()
export class AccountDeletionService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}

  async status(userId: string) {
    const request = await this.db.accountDeletionRequest.findUnique({
      where: { userId },
      select: { id: true, requestedAt: true, processingAt: true },
    });
    return this.receipt(request);
  }

  async request(userId: string, password: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Hesap bulunamadı.");
    if (!(await compare(password, user.passwordHash)))
      throw new ForbiddenException("Parolanız doğrulanamadı.");
    // createMany(skipDuplicates) uses a database conflict-safe insert. Prisma's
    // empty-update upsert can be emulated as read/create and race under load.
    // Never persist the password or a user-supplied subject/tenant identifier.
    await this.db.accountDeletionRequest.createMany({
      data: [{ userId }],
      skipDuplicates: true,
    });
    const request = await this.db.accountDeletionRequest.findUniqueOrThrow({
      where: { userId },
      select: { id: true, requestedAt: true, processingAt: true },
    });
    return this.receipt(request);
  }

  async pending(after?: string) {
    const requests = await this.db.accountDeletionRequest.findMany({
      where: after ? { id: { gt: after } } : {},
      orderBy: { id: "asc" },
      take: 51,
      select: {
        id: true,
        requestedAt: true,
        processingAt: true,
        user: { select: { id: true, email: true } },
      },
    });
    const items = requests.slice(0, 50);
    return { items, nextCursor: requests.length > 50 ? items[49].id : null };
  }

  // This boundary freezes authorization; it does not erase data or claim completion.
  // Enable only for an operated queue. No worker starts this automatically.
  async beginProcessing(requestId: string, operatorId: string) {
    if (process.env.ACCOUNT_DELETION_PROCESSING_ENABLED !== "true")
      throw new ServiceUnavailableException(
        "Silme işleme kuyruğu etkin değil.",
      );
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const request = await tx.accountDeletionRequest.findUnique({
              where: { id: requestId },
              include: { user: { select: { role: true } } },
            });
            if (!request)
              throw new NotFoundException("Silme talebi bulunamadı.");
            if (request.processingAt) return this.receipt(request);
            if (request.user.role === "SUPER_ADMIN")
              throw new ConflictException(
                "Yönetici hesabı için ayrı inceleme gerekli.",
              );
            const owned = await tx.businessMember.findMany({
              where: { userId: request.userId, role: "BUSINESS_OWNER" },
              select: { businessId: true },
            });
            for (const { businessId } of owned) {
              const remainingOwners = await tx.businessMember.count({
                where: {
                  businessId,
                  role: "BUSINESS_OWNER",
                  userId: { not: request.userId },
                  user: {
                    OR: [
                      { accountDeletionRequest: { is: null } },
                      {
                        accountDeletionRequest: { is: { processingAt: null } },
                      },
                    ],
                  },
                },
              });
              if (!remainingOwners)
                throw new ConflictException(
                  "Önce işletme sahipliği devredilmeli.",
                );
            }
            const processingAt = new Date();
            const updated = await tx.accountDeletionRequest.update({
              where: { id: request.id },
              data: { processingAt },
              select: { id: true, requestedAt: true, processingAt: true },
            });
            await tx.refreshSession.updateMany({
              where: { userId: request.userId, revokedAt: null },
              data: { revokedAt: processingAt },
            });
            await tx.securityEvent.create({
              data: {
                actorId: operatorId,
                actorType: "USER",
                type: "ACCOUNT_DELETION_PROCESSING_STARTED",
                severity: "INFO",
                metadata: { requestId: request.id, subjectId: request.userId },
              },
            });
            return this.receipt(updated);
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (
          attempt < 2 &&
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034"
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException("İşlem yeniden denenmeli.");
  }

  private receipt(
    request: {
      id: string;
      requestedAt: Date;
      processingAt?: Date | null;
    } | null,
  ) {
    return {
      status: request?.processingAt
        ? "PROCESSING"
        : request
          ? "REQUESTED"
          : "NONE",
      request: request
        ? {
            id: request.id,
            requestedAt: request.requestedAt,
            ...(request.processingAt
              ? { processingAt: request.processingAt }
              : {}),
          }
        : null,
      deletionCompleted: false,
    };
  }
}
