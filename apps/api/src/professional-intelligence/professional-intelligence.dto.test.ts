import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SkillDto } from "./professional-intelligence.dto.js";
import { describe, expect, it } from "vitest";
describe("professional DTO", () => {
  it("rejects invalid category and free-text skills", async () =>
    expect(
      await validate(
        plainToInstance(SkillDto, {
          category: "MEDICAL",
          skillCode: "great stylist",
        }),
      ),
    ).not.toHaveLength(0));
});
