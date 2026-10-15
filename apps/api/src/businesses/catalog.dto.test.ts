import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  AssignStaffServiceDto,
  CreateCatalogServiceDto,
} from "./catalog.dto.js";

describe("catalog DTO validation", () => {
  it("rejects negative price and invalid duration", async () => {
    const dto = Object.assign(new CreateCatalogServiceDto(), {
      categoryId: "cat-a",
      name: "Cut",
      durationMinutes: 0,
      price: "-1.00",
      currency: "BAD",
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(["durationMinutes", "price", "currency"]),
    );
  });
  it("rejects unsafe IDs and invalid custom values", async () => {
    const dto = Object.assign(new AssignStaffServiceDto(), {
      serviceId: "../tenant-b",
      customPrice: "-2",
      customDurationMinutes: 0,
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining([
        "serviceId",
        "customPrice",
        "customDurationMinutes",
      ]),
    );
  });
});
