import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateLocationDto } from "./location.dto.js";
import { CreateServiceDto } from "./service.dto.js";
import { UpdateWorkingHoursDto } from "./salon-core.dto.js";

describe("management DTO validation", () => {
  it("rejects invalid coordinates", async () => {
    const dto = Object.assign(new CreateLocationDto(), {
      name: "Main",
      address: "Street 1",
      city: "Istanbul",
      latitude: "91",
      longitude: "181",
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
  it("produces HTTP 400 for an invalid request DTO", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        { name: "X", durationMinutes: -1, price: "1.999", currency: "BAD" },
        { type: "body", metatype: CreateServiceDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("rejects floating duration, unsafe price and invalid currency", async () => {
    const dto = Object.assign(new CreateServiceDto(), {
      name: "Cut",
      durationMinutes: 1.5,
      price: "12.999",
      currency: "NOT",
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(["durationMinutes", "price", "currency"]),
    );
  });
  it("rejects duplicate working-hour days", async () => {
    const dto = Object.assign(new UpdateWorkingHoursDto(), {
      hours: [
        { dayOfWeek: "MONDAY", isOpen: false },
        { dayOfWeek: "MONDAY", isOpen: false },
      ],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
