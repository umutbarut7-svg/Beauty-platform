import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
/* eslint-disable @typescript-eslint/consistent-type-imports */
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import type { UserRole } from "@beauty-platform/types";
import type { PrismaService } from "../database/prisma.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { TokenPayload } from "./auth.types.js";

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
}
interface StoredUser extends PublicUser {
  passwordHash: string;
}
export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          passwordHash: await hash(password, 12),
          customer: { create: {} },
        },
      });
      return this.issue(user);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      )
        throw new ConflictException("Email already registered");
      throw error;
    }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || !(await compare(password, user.passwordHash)))
      throw new UnauthorizedException("Invalid email or password");
    return this.issue(user);
  }

  async refresh(rawToken: string): Promise<AuthResult> {
    const payload = await this.verifyRefresh(rawToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !safeEqual(session.tokenHash, digest(rawToken))
    )
      throw new UnauthorizedException("Refresh token is invalid or revoked");
    const revoked = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null, tokenHash: digest(rawToken) },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1)
      throw new UnauthorizedException("Refresh token is invalid or revoked");
    return this.issue(session.user);
  }

  async logout(rawToken: string): Promise<void> {
    const payload = await this.verifyRefresh(rawToken);
    await this.prisma.refreshSession.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(user: StoredUser): Promise<AuthResult> {
    const sessionId = randomUUID();
    const base = {
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
    };
    const accessToken = await this.jwt.signAsync(
      { ...base, type: "access" } satisfies TokenPayload,
      {
        secret: requiredSecret("JWT_ACCESS_SECRET"),
        expiresIn: (process.env.JWT_ACCESS_TTL ?? "15m") as never,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, sid: sessionId, type: "refresh" } satisfies TokenPayload,
      {
        secret: requiredSecret("JWT_REFRESH_SECRET"),
        expiresIn: (process.env.JWT_REFRESH_TTL ?? "30d") as never,
      },
    );
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: digest(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });
    return {
      user: { id: user.id, email: user.email, role: user.role as UserRole },
      accessToken,
      refreshToken,
    };
  }

  private async verifyRefresh(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: requiredSecret("JWT_REFRESH_SECRET"),
      });
      if (payload.type !== "refresh" || !payload.sid)
        throw new Error("wrong token type");
      return payload;
    } catch {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }
  }
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function requiredSecret(
  name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET",
): string {
  const value = process.env[name];
  if (!value || value.length < 32)
    throw new Error(`${name} must contain at least 32 characters`);
  return value;
}
