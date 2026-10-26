import { hash } from "bcryptjs";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountErasureService } from "./account-erasure.service.js";

describe("account erasure and scoped completion receipts", () => {
  afterEach(() => vi.unstubAllEnvs());
  async function fixture() {
    const user = {
      id: "owner_1%",
      email: "owner%_@example.test",
      role: "CUSTOMER",
      passwordHash: await hash("correct-password", 4),
      customer: { id: "customer-1" },
    };
    const request = {
      id: "request-1",
      userId: user.id,
      requestedAt: new Date(),
      processingAt: new Date(),
      completedAt: null as Date | null,
      receiptTokenHash: null as string | null,
      user,
    };
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(user),
        delete: vi.fn().mockResolvedValue(user),
      },
      accountDeletionRequest: {
        findUnique: vi.fn().mockResolvedValue(request),
        findUniqueOrThrow: vi.fn().mockResolvedValue(request),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockImplementation(async ({ data }) => {
          if (request.processingAt || request.completedAt) return { count: 0 };
          Object.assign(request, data);
          return { count: 1 };
        }),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      mvpPhoto: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      mvpPhotoAnalysis: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      mvpPhotoConsent: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      mvpPrivacyEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      accountDeletionEvidence: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      securityEvent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
      },
      abuseLimitBucket: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const db = {
      ...tx,
      $transaction: vi
        .fn()
        .mockImplementation(async (operation) => operation(tx)),
    };
    vi.stubEnv("ACCOUNT_DELETION_ERASURE_ENABLED", "true");
    return {
      user,
      request,
      tx,
      db,
      service: new AccountErasureService(db as never),
    };
  }
  it("keeps erasure disabled by default", async () => {
    const { service, db } = await fixture();
    vi.stubEnv("ACCOUNT_DELETION_ERASURE_ENABLED", "false");
    await expect(
      service.finalize("request-1", "operator"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("requires processing and refuses unverified physical photo erasure", async () => {
    const { service, request, tx } = await fixture();
    request.processingAt = null as never;
    await expect(
      service.finalize("request-1", "operator"),
    ).rejects.toBeInstanceOf(ConflictException);
    request.processingAt = new Date();
    tx.mvpPhoto.count.mockResolvedValue(1);
    await expect(
      service.finalize("request-1", "operator"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(tx.mvpPhoto.deleteMany).not.toHaveBeenCalled();
  });
  it("refuses unreviewed FK or loose JSON data without deleting any account rows", async () => {
    const { service, tx } = await fixture();
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { model: "Appointment" },
        { model: "SecurityEvent" },
      ]);
    await expect(
      service.finalize("request-1", "operator"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(tx.mvpPhoto.deleteMany).not.toHaveBeenCalled();
  });
  it("discovers schema-wide references with escaped patterns and never exposes record bodies", async () => {
    const { service, tx, user } = await fixture();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ model: "BusinessCustomer" }]);
    expect(await service.inspect("request-1")).toEqual({
      status: "PROCESSING",
      pendingPhotos: 0,
      blockers: ["BusinessCustomer"],
    });
    const [sql, patterns, requestId, subjectId] =
      tx.$queryRawUnsafe.mock.calls[0]!;
    expect(sql).toContain('"MvpVerificationRequest"');
    expect(sql).toContain('"Appointment"');
    expect(sql).not.toContain(user.email);
    expect(requestId).toBe("request-1");
    expect(subjectId).toBe(user.id);
    expect(patterns).toEqual([
      '%"owner\\_1\\%"%',
      '%"owner\\%\\_@example.test"%',
      '%"customer-1"%',
    ]);
  });
  it("performs owned-data deletion and completion in one serializable transaction", async () => {
    const { service, tx, db } = await fixture();
    await expect(service.finalize("request-1", "operator")).resolves.toEqual({
      status: "COMPLETED",
      deletionCompleted: true,
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 20000,
    });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "owner_1%" } });
    expect(tx.accountDeletionRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { completedAt: expect.any(Date) },
    });
    expect(tx.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "ACCOUNT_DELETION_COMPLETED",
        metadata: { requestId: "request-1" },
      }),
    });
  });
  it("retains minimized photo proof until its original expiry without an account identity", async () => {
    const { service, tx, user } = await fixture();
    const recordedAt = new Date(Date.now() - 86400000),
      expiresAt = new Date(Date.now() + 89 * 86400000);
    tx.mvpPhotoConsent.findMany.mockResolvedValue([
      {
        id: "consent-1",
        policyVersion: "approved-policy",
        noticeHash: "a".repeat(64),
        createdAt: recordedAt,
        auditExpiresAt: expiresAt,
      },
    ]);
    tx.mvpPrivacyEvent.findMany.mockResolvedValue([
      {
        id: "event-1",
        action: "photo.consent.withdrawn",
        createdAt: recordedAt,
        expiresAt,
      },
    ]);
    await service.finalize("request-1", "operator");
    const saved = tx.accountDeletionEvidence.createMany.mock.calls[0]![0];
    expect(saved).toMatchObject({
      skipDuplicates: true,
      data: [
        {
          requestId: "request-1",
          kind: "PHOTO_CONSENT",
          policyVersion: "approved-policy",
          noticeHash: "a".repeat(64),
          recordedAt,
          expiresAt,
          sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        {
          requestId: "request-1",
          kind: "PHOTO_EVENT",
          action: "photo.consent.withdrawn",
          recordedAt,
          expiresAt,
          sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ],
    });
    expect(JSON.stringify(saved)).not.toContain(user.id);
    expect(JSON.stringify(saved)).not.toContain(user.email);
    expect(tx.securityEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actorId: user.id, businessId: null }),
        data: { actorId: null, actorType: null, requestId: null, route: null },
      }),
    );
  });
  it("retries serialization failure and never repeats completed erasure", async () => {
    const { service, request, db, tx } = await fixture();
    db.$transaction.mockRejectedValueOnce({ code: "P2034" });
    await service.finalize("request-1", "operator");
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    tx.user.delete.mockClear();
    request.completedAt = new Date();
    request.userId = null as never;
    await expect(service.finalize("request-1", "operator")).resolves.toEqual({
      status: "COMPLETED",
      deletionCompleted: true,
    });
    expect(tx.user.delete).not.toHaveBeenCalled();
  });
  it("verifies the password before issuing a rotatable receipt capability", async () => {
    const { service, request, tx } = await fixture();
    request.processingAt = null as never;
    await expect(service.tracking("owner_1%", "wrong")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.accountDeletionRequest.updateMany).not.toHaveBeenCalled();
    const first = await service.tracking("owner_1%", "correct-password");
    expect(first.token).toMatch(/^request-1\.[a-zA-Z0-9_-]{43}$/);
    expect(request.receiptTokenHash).not.toContain(first.token);
    expect(await service.receipt(first.token)).toMatchObject({
      status: "REQUESTED",
      deletionCompleted: false,
    });
    const second = await service.tracking("owner_1%", "correct-password");
    await expect(service.receipt(first.token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    request.processingAt = new Date();
    request.completedAt = new Date();
    request.userId = null as never;
    expect(await service.receipt(second.token)).toMatchObject({
      status: "COMPLETED",
      deletionCompleted: true,
    });
    expect(JSON.stringify(await service.receipt(second.token))).not.toContain(
      "owner",
    );
  });
  it("rejects receipt-token changes after processing and rejects malformed capabilities", async () => {
    const { service } = await fixture();
    await expect(
      service.tracking("owner_1%", "correct-password"),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.receipt("invalid")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.receipt(`request-1.${"A".repeat(43)}`),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("does not fabricate completion from a quarantined historical receipt", async () => {
    const { service, request, user } = await fixture();
    request.processingAt = null as never;
    const tracking = await service.tracking(user.id, "correct-password");
    Object.assign(user, { restoreQuarantinedAt: new Date() });
    expect(await service.receipt(tracking.token)).toMatchObject({
      status: "RESTORE_REVIEW",
      deletionCompleted: false,
    });
    request.processingAt = new Date();
    await expect(
      service.finalize(request.id, "operator"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
