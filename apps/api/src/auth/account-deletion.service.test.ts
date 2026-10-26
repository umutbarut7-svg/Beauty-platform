import { hash } from "bcryptjs";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
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
    expect(db.accountDeletionRequest.createMany).not.toHaveBeenCalled();
  });
  it("rejects a missing account without storing a request", async () => {
    const { db, service } = await fixture();
    db.user.findUnique.mockResolvedValue(null);
    await expect(
      service.request("missing", "correct-password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.accountDeletionRequest.createMany).not.toHaveBeenCalled();
  });
  it("stores only the authenticated owner and never reports completed deletion", async () => {
    const { db, service } = await fixture();
    const result = await service.request("owner", "correct-password");
    expect(db.accountDeletionRequest.createMany).toHaveBeenCalledWith({
      data: [{ userId: "owner" }],
      skipDuplicates: true,
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
      select: { id: true, requestedAt: true, processingAt: true },
    });
    expect(db.accountDeletionRequest.createMany).not.toHaveBeenCalled();
  });
});

describe("account deletion processing boundary", () => {
  afterEach(() => vi.unstubAllEnvs());
  function processingFixture() {
    const request = {
      id: "r1",
      userId: "u1",
      requestedAt: new Date(),
      processingAt: null,
      user: { role: "CUSTOMER" },
    };
    const tx = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      mvpPhotoConsent: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      mvpPhoto: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mvpPhotoAnalysis: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mvpPrivacyEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      accountDeletionRequest: {
        findUnique: vi.fn().mockResolvedValue(request),
        update: vi
          .fn()
          .mockImplementation(async ({ data }) => ({ ...request, ...data })),
      },
      businessMember: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      securityEvent: { create: vi.fn().mockResolvedValue({}) },
      refreshSession: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const db = {
      $transaction: vi.fn().mockImplementation(async (action) => action(tx)),
    };
    vi.stubEnv("ACCOUNT_DELETION_PROCESSING_ENABLED", "true");
    return {
      tx,
      db,
      request,
      service: new AccountDeletionService(db as never),
    };
  }
  it("is disabled by default and does not touch the database", async () => {
    const { db, service } = processingFixture();
    vi.stubEnv("ACCOUNT_DELETION_PROCESSING_ENABLED", "false");
    await expect(service.beginProcessing("r1", "admin")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects missing requests and protects administrator accounts", async () => {
    const { tx, request, service } = processingFixture();
    tx.accountDeletionRequest.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.beginProcessing("missing", "admin"),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.accountDeletionRequest.findUnique.mockResolvedValue({
      ...request,
      user: { role: "SUPER_ADMIN" },
    });
    await expect(service.beginProcessing("r1", "admin")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.accountDeletionRequest.update).not.toHaveBeenCalled();
    expect(tx.refreshSession.updateMany).not.toHaveBeenCalled();
  });
  it("requires an available replacement owner before freezing an account", async () => {
    const { tx, service } = processingFixture();
    tx.businessMember.findMany.mockResolvedValue([
      { businessId: "business-a" },
    ]);
    await expect(service.beginProcessing("r1", "admin")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.accountDeletionRequest.update).not.toHaveBeenCalled();
    expect(tx.refreshSession.updateMany).not.toHaveBeenCalled();
    tx.businessMember.count.mockResolvedValue(1);
    expect(await service.beginProcessing("r1", "admin")).toMatchObject({
      status: "PROCESSING",
      deletionCompleted: false,
    });
  });
  it("atomically freezes access and revokes every refresh session without reporting erasure", async () => {
    const { tx, db, service } = processingFixture();
    const receipt = await service.beginProcessing("r1", "admin");
    expect(receipt).toMatchObject({
      status: "PROCESSING",
      deletionCompleted: false,
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: receipt.request!.processingAt },
    });
  });
  it("withdraws every owner photo and scrubs consultation content without losing storage keys", async () => {
    const { tx, service } = processingFixture();
    const expiresAt = new Date("2027-01-01T00:00:00Z");
    tx.mvpPhotoConsent.findMany.mockResolvedValue([
      { id: "c1", auditExpiresAt: expiresAt },
      { id: "c2", auditExpiresAt: expiresAt },
    ]);
    await service.beginProcessing("r1", "admin");
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      "mvp-photo:u1",
    );
    expect(tx.mvpPhotoConsent.updateMany).toHaveBeenCalledWith({
      where: { ownerId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.mvpPhoto.updateMany).toHaveBeenCalledWith({
      where: { ownerId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.mvpPhotoAnalysis.updateMany).toHaveBeenCalledWith({
      where: { ownerId: "u1" },
      data: expect.objectContaining({
        status: "REVOKED",
        intent: "",
        target: "",
        answers: [],
      }),
    });
    expect(tx.mvpPrivacyEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          ownerId: "u1",
          resourceId: "c1",
          action: "photo.consent.withdrawn",
          expiresAt,
          correlationId: expect.any(String),
        },
        {
          ownerId: "u1",
          resourceId: "c2",
          action: "photo.consent.withdrawn",
          expiresAt,
          correlationId: expect.any(String),
        },
      ],
    });
  });
  it("retries serialization conflicts and is idempotent once processing started", async () => {
    const { db, tx, request, service } = processingFixture();
    db.$transaction.mockRejectedValueOnce({ code: "P2034" });
    await service.beginProcessing("r1", "admin");
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    tx.accountDeletionRequest.update.mockClear();
    tx.refreshSession.updateMany.mockClear();
    tx.accountDeletionRequest.findUnique.mockResolvedValue({
      ...request,
      processingAt: new Date(),
    });
    expect(await service.beginProcessing("r1", "admin")).toMatchObject({
      status: "PROCESSING",
    });
    expect(tx.accountDeletionRequest.update).not.toHaveBeenCalled();
    expect(tx.refreshSession.updateMany).not.toHaveBeenCalled();
  });
});
