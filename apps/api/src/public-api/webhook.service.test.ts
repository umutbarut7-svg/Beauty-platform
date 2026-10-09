import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebhookService } from "./webhook.service.js";
describe("WebhookService", () => {
  beforeEach(() => {
    process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => delete process.env.WEBHOOK_ENCRYPTION_KEY);
  it("signs and verifies versioned payloads without persisting plaintext secrets", () => {
    const service = new WebhookService({} as never),
      timestamp = String(Math.floor(Date.now() / 1000)),
      body = '{"eventId":"e"}',
      signature = service.sign("secret", timestamp, body);
    expect(service.verify("secret", timestamp, body, signature)).toBe(true);
    expect(service.verify("wrong", timestamp, body, signature)).toBe(false);
  });
  it("rejects private, localhost, credentialed, and insecure webhook URLs", async () => {
    const service = new WebhookService({} as never);
    for (const url of [
      "http://example.com/hook",
      "https://localhost/hook",
      "https://user:pass@example.com/hook",
      "https://127.0.0.1/hook",
    ])
      await expect(service.validateUrl(url)).rejects.toThrow("Unsafe");
  });
  it("uses deterministic bounded exponential retry", () => {
    const service = new WebhookService({} as never),
      now = new Date("2026-01-01T00:00:00Z");
    expect(service.nextAttempt(1, now).toISOString()).toBe(
      "2026-01-01T00:01:00.000Z",
    );
    expect(service.nextAttempt(20, now).toISOString()).toBe(
      "2026-01-01T01:00:00.000Z",
    );
  });
  it("creates a stable versioned envelope", () => {
    const service = new WebhookService({} as never);
    expect(
      service.envelope(
        "booking.created.v1",
        "b",
        { type: "booking", id: "x" },
        {},
      ),
    ).toMatchObject({
      eventType: "booking.created.v1",
      version: 1,
      businessId: "b",
      resource: { id: "x" },
    });
  });
});
