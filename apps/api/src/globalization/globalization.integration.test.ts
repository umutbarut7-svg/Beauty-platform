import { describe, expect, it, vi } from "vitest";
import { ContextBuilder } from "../ai/context-builder.service.js";
import { ExternalAiToolsService } from "../public-api/external-ai-tools.service.js";
import { PublicApiController } from "../public-api/public-api.controller.js";
import type { ApiPrincipal } from "../public-api/public-api.types.js";
const principal: ApiPrincipal = {
  userId: "integration-owner",
  applicationId: "a",
  clientId: "c",
  credentialId: "k",
  businessId: "tenant-a",
  scopes: ["business.read"],
};
describe("globalization integrations", () => {
  it("binds public globalization context to the authenticated API tenant", async () => {
    const publicService = { requireScope: vi.fn() };
    const globalization = {
      resolveForBusiness: vi.fn().mockResolvedValue({
        marketKey: "gb",
        currency: "GBP",
        timezone: "Europe/London",
      }),
    };
    const controller = new PublicApiController(
      publicService as never,
      {} as never,
      {} as never,
      {} as never,
      globalization as never,
    );
    const response = await controller.globalizationContext(principal, {
      locale: "en-GB",
    });
    expect(globalization.resolveForBusiness).toHaveBeenCalledWith("tenant-a", {
      locale: "en-GB",
    });
    expect(publicService.requireScope).toHaveBeenCalledWith(
      principal,
      "business.read",
    );
    expect(response.data.currency).toBe("GBP");
  });
  it("publishes an external AI read contract without currency or timezone defaults", () => {
    const tools = new ExternalAiToolsService({ assertScope: vi.fn() } as never);
    expect(
      tools.list().find((tool) => tool.name === "getGlobalizationContext"),
    ).toMatchObject({
      operation: "READ",
      requiredScopes: ["business.read"],
      inputSchema: { type: "object" },
    });
  });
  it("adds only explicitly resolved globalization values to AI context", () => {
    const builder = new ContextBuilder();
    expect(builder.build({}, [], [], 5000).globalization).toBeNull();
    expect(
      builder.build({}, [], [], 5000, {
        market: "gb",
        locale: "en-GB",
        language: "en",
        currency: "GBP",
        timezone: "Europe/London",
      }).globalization,
    ).toEqual({
      market: "gb",
      locale: "en-GB",
      language: "en",
      currency: "GBP",
      timezone: "Europe/London",
    });
  });
});
