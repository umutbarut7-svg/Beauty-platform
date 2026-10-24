import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SafeExceptionFilter } from "./safe-exception.filter.js";

const host = (reply: {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}) =>
  ({
    switchToHttp: () => ({ getResponse: () => reply }),
  }) as never;

describe("SafeExceptionFilter", () => {
  const security = { record: vi.fn().mockResolvedValue({}) };
  it("uses the framework adapter for native middleware error replies", async () => {
    const native = {};
    const adapter = { httpAdapter: { reply: vi.fn() } };
    await new SafeExceptionFilter(security as never, adapter as never).catch(
      new Error("private internal detail"),
      { switchToHttp: () => ({ getResponse: () => native }) } as never,
    );
    expect(adapter.httpAdapter.reply).toHaveBeenCalledWith(
      native,
      expect.objectContaining({
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      }),
      500,
    );
  });
  it("preserves domain HTTP responses using the standard taxonomy", async () => {
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await new SafeExceptionFilter(security as never).catch(
      new BadRequestException("invalid"),
      host(reply),
    );
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR", message: "invalid" }),
    );
  });
  it("does not expose stack traces or internal exception details", async () => {
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await new SafeExceptionFilter(security as never).catch(
      new Error("postgresql://secret@internal/database"),
      host(reply),
    );
    expect(reply.status).toHaveBeenCalledWith(500);
    const response = reply.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(response.message).toBe("Internal server error");
    expect(JSON.stringify(response)).not.toContain("secret");
    expect(response).not.toHaveProperty("stack");
  });
  it("records authentication, authorization, and rate-limit failures", async () => {
    for (const exception of [
      new UnauthorizedException(),
      new ForbiddenException(),
      new HttpException("limited", 429),
    ]) {
      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
      await new SafeExceptionFilter(security as never).catch(
        exception,
        host(reply),
      );
    }
    expect(security.record).toHaveBeenCalledWith(
      "AUTHENTICATION_FAILED",
      "WARNING",
    );
    expect(security.record).toHaveBeenCalledWith(
      "AUTHORIZATION_DENIED",
      "WARNING",
    );
    expect(security.record).toHaveBeenCalledWith(
      "RATE_LIMIT_EXCEEDED",
      "WARNING",
    );
  });
});
