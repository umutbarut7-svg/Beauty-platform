/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type {
  CreateConversationDto,
  MessageListQueryDto,
  SendMessageDto,
} from "./messaging.dto.js";
@Injectable()
export class MessagingService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  async create(u: AuthenticatedUser, b: string, d: CreateConversationDto) {
    await this.permissions.assertBusinessAccess(u, b, "communication:write");
    const ids = [...new Set([u.id, ...d.participantUserIds])];
    const count = await this.db.businessMember.count({
      where: { businessId: b, userId: { in: ids } },
    });
    if (count !== ids.length)
      throw new BadRequestException(
        "All participants must belong to this business",
      );
    return this.db.$transaction(async (tx: any) =>
      tx.conversation.create({
        data: {
          businessId: b,
          subject: d.subject?.trim(),
          participants: {
            create: ids.map((userId) => ({ businessId: b, userId })),
          },
        },
        include: { participants: { select: { userId: true, joinedAt: true } } },
      }),
    );
  }
  async list(u: AuthenticatedUser, b: string) {
    await this.permissions.assertBusinessAccess(u, b, "communication:read");
    return this.db.conversation.findMany({
      where: {
        businessId: b,
        participants: { some: { userId: u.id, leftAt: null } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      include: {
        participants: { select: { userId: true } },
        messages: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });
  }
  async detail(u: AuthenticatedUser, b: string, id: string) {
    await this.permissions.assertBusinessAccess(u, b, "communication:read");
    await this.participant(b, id, u.id);
    return this.db.conversation.findFirst({
      where: { businessId: b, id },
      include: {
        participants: {
          select: { userId: true, joinedAt: true, leftAt: true },
        },
      },
    });
  }
  async messages(
    u: AuthenticatedUser,
    b: string,
    id: string,
    q: MessageListQueryDto,
  ) {
    await this.permissions.assertBusinessAccess(u, b, "communication:read");
    await this.participant(b, id, u.id);
    return this.db.message.findMany({
      where: { businessId: b, conversationId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: {
        receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
      },
    });
  }
  async send(u: AuthenticatedUser, b: string, id: string, d: SendMessageDto) {
    await this.permissions.assertBusinessAccess(u, b, "communication:write");
    const conversation = await this.participant(b, id, u.id);
    if (conversation.status !== "ACTIVE")
      throw new ConflictException("Conversation is not active");
    try {
      return await this.db.$transaction(async (tx: any) => {
        const participants = await tx.conversationParticipant.findMany({
          where: { businessId: b, conversationId: id, leftAt: null },
          select: { userId: true },
        });
        const message = await tx.message.create({
          data: {
            businessId: b,
            conversationId: id,
            senderUserId: u.id,
            body: d.body.trim(),
            idempotencyKey: d.idempotencyKey,
            receipts: {
              create: participants
                .filter((p: any) => p.userId !== u.id)
                .map((p: any) => ({
                  conversationId: id,
                  userId: p.userId,
                  deliveredAt: new Date(),
                })),
            },
          },
          include: { receipts: true },
        });
        await tx.conversation.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
        return message;
      });
    } catch (e) {
      if ((e as any)?.code === "P2002")
        throw new ConflictException("Message idempotency key already exists");
      throw e;
    }
  }
  async markRead(
    u: AuthenticatedUser,
    b: string,
    conversationId: string,
    messageId: string,
  ) {
    await this.permissions.assertBusinessAccess(u, b, "communication:read");
    await this.participant(b, conversationId, u.id);
    const m = await this.db.message.findFirst({
      where: { id: messageId, businessId: b, conversationId },
    });
    if (!m) throw new NotFoundException("Message not found");
    if (m.senderUserId === u.id)
      throw new BadRequestException("Sender cannot mark own message receipt");
    const receipt = await this.db.messageReceipt.updateMany({
      where: { messageId, userId: u.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (!receipt.count)
      throw new ConflictException(
        "Message is already read or receipt is missing",
      );
    return { read: true };
  }
  private async participant(b: string, c: string, u: string) {
    const p = await this.db.conversationParticipant.findFirst({
      where: { businessId: b, conversationId: c, userId: u, leftAt: null },
      include: { conversation: true },
    });
    if (!p) throw new ForbiddenException("Conversation access denied");
    return p.conversation;
  }
}
