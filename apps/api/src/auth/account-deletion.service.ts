import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { compare } from "bcryptjs";
import type { PrismaService } from "../database/prisma.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";

@Injectable()
export class AccountDeletionService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}

  async status(userId: string) {
    const request = await this.db.accountDeletionRequest.findUnique({
      where: { userId },
      select: { id: true, requestedAt: true },
    });
    return this.receipt(request);
  }

  async request(userId: string, password: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Hesap bulunamadı.");
    if (!(await compare(password, user.passwordHash)))
      throw new ForbiddenException("Parolanız doğrulanamadı.");
    // The unique owner key makes concurrent retries one request. No password,
    // user-supplied identity, tenant identifier or business data is stored.
    const request = await this.db.accountDeletionRequest.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true, requestedAt: true },
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
        user: { select: { id: true, email: true } },
      },
    });
    const items = requests.slice(0, 50);
    return { items, nextCursor: requests.length > 50 ? items[49].id : null };
  }

  private receipt(request: { id: string; requestedAt: Date } | null) {
    return {
      status: request ? "REQUESTED" : "NONE",
      request,
      deletionCompleted: false,
    };
  }
}
