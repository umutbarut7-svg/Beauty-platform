/* eslint-disable @typescript-eslint/no-explicit-any */
import { JwtService } from "@nestjs/jwt";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "./auth.service.js";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32-characters";

function fakePrisma() {
  const users: any[] = [];
  const sessions = new Map<string, any>();
  return {
    users,
    sessions,
    user: {
      create: async ({ data }: any) => {
        if (users.some((u) => u.email === data.email))
          throw Object.assign(new Error("duplicate"), { code: "P2002" });
        const user = { id: `u${users.length + 1}`, role: "CUSTOMER", ...data };
        users.push(user);
        return user;
      },
      findUnique: async ({ where }: any) =>
        users.find((u) => u.email === where.email) ?? null,
    },
    refreshSession: {
      create: async ({ data }: any) => {
        sessions.set(data.id, {
          ...data,
          revokedAt: null,
          user: users.find((u) => u.id === data.userId),
        });
        return data;
      },
      findUnique: async ({ where }: any) => sessions.get(where.id) ?? null,
      update: async ({ where, data }: any) =>
        Object.assign(sessions.get(where.id), data),
      updateMany: async ({ where, data }: any) => {
        const value = sessions.get(where.id);
        if (
          value &&
          (where.userId === undefined || value.userId === where.userId) &&
          (where.tokenHash === undefined ||
            value.tokenHash === where.tokenHash) &&
          !value.revokedAt
        ) {
          Object.assign(value, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
}

describe("AuthService", () => {
  let db: ReturnType<typeof fakePrisma>;
  let service: AuthService;
  beforeEach(() => {
    db = fakePrisma();
    service = new AuthService(db as never, new JwtService());
  });
  it("registers without exposing the password hash and rejects duplicate email", async () => {
    const result = await service.register(
      "Person@Example.com",
      "strong-password-123",
    );
    expect(result.user.email).toBe("person@example.com");
    expect(result).not.toHaveProperty("passwordHash");
    await expect(
      service.register("person@example.com", "strong-password-123"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("logs in with the valid password and rejects an invalid password", async () => {
    await service.register("person@example.com", "strong-password-123");
    await expect(
      service.login("person@example.com", "strong-password-123"),
    ).resolves.toHaveProperty("accessToken");
    await expect(
      service.login("person@example.com", "wrong"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it("rotates refresh tokens and rejects reuse", async () => {
    const first = await service.register(
      "person@example.com",
      "strong-password-123",
    );
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it("invalidates a refresh session on logout", async () => {
    const tokens = await service.register(
      "person@example.com",
      "strong-password-123",
    );
    await service.logout(tokens.refreshToken);
    await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
