import { hash } from "bcryptjs";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AccountDeletionService } from "./account-deletion.service.js";

async function fixture() {
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "owner",
        passwordHash: await hash("correct-password", 4),
      }),
    },
    accountDeletionRequest: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        id: "request-1",
        requestedAt: new Date("2026-10-25T00:00:00Z"),
      }),
    },
  };
  return { db, service: new AccountDeletionService(db as never) };
}

describe("account deletion request intake", () => {
  it("rejects a wrong password without storing a request", async () => {
    const { db, service } = await fixture();
    await expect(service.request("owner", "wrong")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.accountDeletionRequest.upsert).not.toHaveBeenCalled();
  });
  it("rejects a missing account without storing a request", async () => {
    const { db, service } = await fixture();
    db.user.findUnique.mockResolvedValue(null);
    await expect(
      service.request("missing", "correct-password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.accountDeletionRequest.upsert).not.toHaveBeenCalled();
  });
  it("stores only the authenticated owner and never reports completed deletion", async () => {
    const { db, service } = await fixture();
    const result = await service.request("owner", "correct-password");
    expect(db.accountDeletionRequest.upsert).toHaveBeenCalledWith({
      where: { userId: "owner" },
      create: { userId: "owner" },
      update: {},
      select: { id: true, requestedAt: true },
    });
    expect(result).toMatchObject({
      status: "REQUESTED",
      deletionCompleted: false,
      request: { id: "request-1" },
    });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("owner");
  });
  it("looks up status by the authenticated owner without creating a request", async () => {
    const { db, service } = await fixture();
    expect(await service.status("other-owner")).toEqual({
      status: "NONE",
      request: null,
      deletionCompleted: false,
    });
    expect(db.accountDeletionRequest.findUnique).toHaveBeenCalledWith({
      where: { userId: "other-owner" },
      select: { id: true, requestedAt: true },
    });
    expect(db.accountDeletionRequest.upsert).not.toHaveBeenCalled();
  });
});
