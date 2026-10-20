import { describe, expect, it, vi } from "vitest";
import { ApiError, MvpApiClient } from "./mvp-client.js";
describe("MVP transport security", () => {
  it("calls the browser fetch with its global receiver", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response("{}"));
    } as typeof fetch;
    try {
      await new MvpApiClient("https://api.example.test").request("/health");
    } finally {
      globalThis.fetch = original;
    }
  });
  it.each([
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com?token=secret",
  ])("rejects unsafe origin %s", (url) => {
    expect(() => new MvpApiClient(url)).toThrow();
  });
  it("uses memory-only credentials and clears them on 401", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: "u", role: "CUSTOMER" },
            accessToken: "test-access",
            refreshToken: "test-refresh",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}"));
    const api = new MvpApiClient("https://api.example.test", transport);
    await api.signIn("login", "test@example.test", "test-password");
    await expect(api.request("/mvp/v1/bookings")).rejects.toBeInstanceOf(
      ApiError,
    );
    await api.request("/auth/me");
    expect(transport.mock.calls[1]?.[1].headers.authorization).toBe(
      "Bearer test-access",
    );
    expect(transport.mock.calls[2]?.[1].headers.authorization).toBeUndefined();
    expect(JSON.stringify(api)).not.toContain("test-access");
  });
  it("never retries unsafe writes or leaks upstream error content", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response('{"secret":"provider-token"}', { status: 503 }),
      );
    const api = new MvpApiClient("https://api.example.test", transport);
    await expect(api.request("/booking", "POST", {})).rejects.toThrow(
      "kullanılamıyor",
    );
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(api.request("//attacker.test")).rejects.toThrow(
      "Invalid API path",
    );
  });
  it("rejects an old session's body if credentials are cleared while JSON is streaming", async () => {
    let finish!: (body: unknown) => void;
    let started!: () => void;
    const parsing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const body = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const response = new Response("{}");
    vi.spyOn(response, "json").mockImplementation(() => {
      started();
      return body;
    });
    const api = new MvpApiClient(
      "https://api.example.test",
      vi.fn().mockResolvedValue(response),
    );
    const request = api.request("/mvp/v1/passport");
    const rejected = expect(request).rejects.toThrow("Oturum değişti.");
    await parsing;
    api.clear();
    finish({ items: [{ summary: "previous user's private result" }] });
    await rejected;
  });
});
