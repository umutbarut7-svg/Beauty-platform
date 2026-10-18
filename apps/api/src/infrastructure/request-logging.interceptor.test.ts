import { BadRequestException } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { describe, expect, it } from "vitest";
import { MetricsService } from "./metrics.service.js";
import { RequestLoggingInterceptor } from "./request-logging.interceptor.js";

const context = {
  switchToHttp: () => ({
    getRequest: () => ({
      method: "GET",
      params: { businessId: "tenant-a" },
      routeOptions: { url: "/businesses/:businessId/resource" },
    }),
    getResponse: () => ({ statusCode: 200 }),
  }),
} as never;

describe("RequestLoggingInterceptor", () => {
  it("instruments successful and failed requests without metric identifiers", async () => {
    const metrics = new MetricsService();
    const interceptor = new RequestLoggingInterceptor(metrics);
    await new Promise<void>((resolve) =>
      interceptor
        .intercept(context, { handle: () => of({ ok: true }) })
        .subscribe({ complete: resolve }),
    );
    await new Promise<void>((resolve) =>
      interceptor
        .intercept(context, {
          handle: () => throwError(() => new BadRequestException("invalid")),
        })
        .subscribe({ error: () => resolve() }),
    );
    expect(metrics.snapshot()).toMatchObject({ requests: 2, errors: 1 });
    expect(metrics.snapshot()).not.toHaveProperty("requestId");
  });
});
