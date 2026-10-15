import { describe, expect, it, vi } from "vitest";
import { withRetry, withTimeout } from "./retry.js";

describe("reliability policies", () => {
  it("bounds exponential retry and excludes non-transient failures", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      withRetry(operation, {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        retryable: () => true,
        sleep,
      }),
    ).resolves.toBe("ok");
    expect(sleep).toHaveBeenCalledWith(10);
    const unsafe = vi.fn().mockRejectedValue(new Error("unsafe"));
    await expect(
      withRetry(unsafe, {
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 2,
        retryable: () => false,
        sleep,
      }),
    ).rejects.toThrow("unsafe");
    expect(unsafe).toHaveBeenCalledTimes(1);
  });
  it("aborts bounded external operations", async () => {
    await expect(
      withTimeout(
        (signal) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          ),
        5,
      ),
    ).rejects.toThrow("aborted");
  });
});
