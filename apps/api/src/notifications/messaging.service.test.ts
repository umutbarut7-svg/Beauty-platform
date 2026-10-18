/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { MessagingService } from "./messaging.service.js";
const user: any = { id: "u", role: "STAFF" };
function fixture(member = true) {
  const messages: any[] = [];
  const tx: any = {
    conversation: {
      create: async () => ({ id: "c" }),
      update: async () => ({}),
    },
    conversationParticipant: {
      findMany: async () => [{ userId: "u" }, { userId: "v" }],
    },
    message: {
      create: async ({ data }: any) => {
        const message = { id: "m", ...data, receipts: data.receipts.create };
        messages.push(message);
        return message;
      },
    },
  };
  const db: any = {
    businessMember: { count: async () => 2 },
    $transaction: async (fn: any) => fn(tx),
    conversationParticipant: {
      findFirst: async () =>
        member ? { conversation: { id: "c", status: "ACTIVE" } } : null,
    },
    conversation: { findMany: async () => [] },
    message: {
      findMany: async () => messages,
      findFirst: async () => ({ id: "m", senderUserId: "v" }),
    },
    messageReceipt: { updateMany: async () => ({ count: 1 }) },
  };
  return new MessagingService(db, {
    assertBusinessAccess: async (_: unknown, businessId: string) => {
      if (businessId !== "b")
        throw new ForbiddenException("Business access denied");
    },
  } as any);
}
describe("MessagingService", () => {
  it("creates messages with recipient receipts and read state", async () => {
    const service = fixture();
    expect(
      (
        await service.send(user, "b", "c", {
          body: "hello",
          idempotencyKey: "k",
        })
      ).receipts,
    ).toHaveLength(1);
    expect(await service.markRead(user, "b", "c", "m")).toEqual({ read: true });
  });
  it("denies non-participants", async () => {
    await expect(fixture(false).detail(user, "b", "c")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it("denies cross-tenant conversation access", async () => {
    await expect(fixture().detail(user, "other", "c")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
