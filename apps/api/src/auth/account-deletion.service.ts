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
    // createMany(skipDuplicates) uses a database conflict-safe insert. Prisma's
    // empty-update upsert can be emulated as read/create and race under load.
    // Never persist the password or a user-supplied subject/tenant identifier.
    await this.db.accountDeletionRequest.createMany({
      data: [{ userId }],
      skipDuplicates: true,
    });
    const request = await this.db.accountDeletionRequest.findUniqueOrThrow({
      where: { userId },
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
