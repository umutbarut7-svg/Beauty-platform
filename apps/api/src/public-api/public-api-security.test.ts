/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { PublicApiCredentialGuard } from "./public-api.guard.js";
import { ExternalAiToolsService } from "./external-ai-tools.service.js";
import { PublicContractController } from "./public-contract.controller.js";
import { PublicApiExceptionFilter } from "./public-api-exception.filter.js";
import { BadRequestException } from "@nestjs/common";
describe("public API security contracts", () => {
  it("rejects tenant spoofing even with a valid key", async () => {
    const guard = new PublicApiCredentialGuard(
      {
        authenticate: vi.fn().mockResolvedValue({ businessId: "tenant-a" }),
      } as any,
      { consume: vi.fn() } as any,
    );
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { "x-api-key": "key", "x-business-id": "tenant-b" },
        }),
      }),
    };
    await expect(guard.canActivate(ctx)).rejects.toThrow("spoofing");
  });
  it("enforces AI scopes and write confirmation", () => {
    const credentials: any = {
      assertScope: vi.fn((_p: any, s: string) => {
        if (s === "booking.write") return;
      }),
    };
    const ai = new ExternalAiToolsService(credentials),
      p: any = { scopes: ["booking.write"] };
    expect(() => ai.authorize(p, "createBooking")).toThrow("confirmation");
    expect(() => ai.authorize(p, "createBooking", true)).toThrow(
      "approved confirmation workflow",
    );
    credentials.assertScope.mockImplementation(() => {
      throw new Error("scope");
    });
    expect(() => ai.authorize(p, "getBusiness")).toThrow("scope");
  });
  it("publishes only explicitly curated public paths", () => {
    const contract = new PublicContractController().contract();
    expect(
      Object.keys(contract.paths).every(
        (x) => !x.includes("intelligence") && !x.includes("marketplace"),
      ),
    ).toBe(true);
  });
  it("returns the stable public error envelope without implementation details", () => {
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));
    const host: any = {
      switchToHttp: () => ({ getResponse: () => ({ status, send }) }),
    };
    new PublicApiExceptionFilter().catch(
      new BadRequestException("Invalid payload"),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid payload",
        requestId: "unknown",
      },
    });
  });
});
