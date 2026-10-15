import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { TemplateRendererService } from "./template-renderer.service.js";
describe("TemplateRendererService", () => {
  const s = new TemplateRendererService();
  it("renders nested variables and escapes content", () =>
    expect(
      s.render(
        {
          subject: "Hi {{customer.firstName}}",
          body: "{{appointment.startAt}}",
          variables: ["customer.firstName", "appointment.startAt"],
        },
        { customer: { firstName: "<Ada>" }, appointment: { startAt: "10:00" } },
      ),
    ).toEqual({ subject: "Hi &lt;Ada&gt;", body: "10:00" }));
  it("rejects missing required variables", () =>
    expect(() =>
      s.render({ body: "{{missing}}", variables: ["missing"] }, {}),
    ).toThrow(BadRequestException));
});
