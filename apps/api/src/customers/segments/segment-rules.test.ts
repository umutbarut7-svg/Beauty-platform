import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { matchesRules, validateRules } from "./segment-rules.js";
describe("segment rules", () => {
  it("evaluates numeric, consent and tag rules", () => {
    expect(
      matchesRules(
        { completedAppointments: 6, marketingConsent: true, tags: ["vip"] },
        [
          { field: "completedAppointments", operator: "gte", value: 5 },
          { field: "marketingConsent", operator: "eq", value: true },
          { field: "tags", operator: "contains", value: "vip" },
        ],
      ),
    ).toBe(true);
  });
  it("rejects malformed operators and array values", () => {
    expect(() =>
      validateRules([{ field: "totalSpend", operator: "in", value: 1 }]),
    ).toThrow(BadRequestException);
    expect(() =>
      validateRules([{ field: "unknown" as never, operator: "eq", value: 1 }]),
    ).toThrow("Unsupported rule field");
  });
});
