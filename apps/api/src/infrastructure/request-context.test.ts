import { describe, expect, it, vi } from "vitest";
import { RequestContextMiddleware, requestContext } from "./request-context.js";

describe("RequestContextMiddleware", () => {
  it("sets correlation headers on the native response supplied by Fastify middleware", () => {
    const setHeader = vi.fn();
    new RequestContextMiddleware().use(
      { headers: { "x-request-id": "native-request" } },
      { setHeader },
      () => {
        expect(requestContext.get()?.requestId).toBe("native-request");
      },
    );
    expect(setHeader).toHaveBeenCalledWith("x-request-id", "native-request");
  });
  it("propagates a safe incoming request id", () => {
    const request = { headers: { "x-request-id": "req-safe_123" } };
    const header = vi.fn();
    new RequestContextMiddleware().use(request, { header }, () => {
      expect(requestContext.get()?.requestId).toBe("req-safe_123");
    });
    expect(header).toHaveBeenCalledWith("x-request-id", "req-safe_123");
  });
  it("replaces invalid identifiers instead of reflecting them", () => {
    const request = { headers: { "x-request-id": "bad\nheader" } };
    const header = vi.fn();
    new RequestContextMiddleware().use(request, { header }, () => undefined);
    const generated = header.mock.calls[0]?.[1] as string;
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });
});
