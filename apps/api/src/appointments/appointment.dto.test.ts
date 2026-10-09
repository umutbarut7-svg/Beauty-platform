import "reflect-metadata";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  AvailabilityQueryDto,
  CreateAppointmentDto,
  ReplaceStaffWorkingHoursDto,
  UpdateAppointmentStatusDto,
} from "./appointment.dto.js";

describe("appointment DTO validation", () => {
  it("rejects invalid timestamps and resource identifiers", async () => {
    const dto = Object.assign(new CreateAppointmentDto(), {
      serviceId: "../service",
      staffMemberId: "staff",
      startsAt: "not-a-date",
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(["serviceId", "startsAt"]),
    );
  });
  it("rejects malformed availability dates", async () => {
    const dto = Object.assign(new AvailabilityQueryDto(), {
      serviceId: "service",
      staffMemberId: "staff",
      date: "2030-13-99",
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
  it("rejects duplicate staff working intervals", async () => {
    const interval = {
      dayOfWeek: "MONDAY",
      startTime: "09:00",
      endTime: "12:00",
    };
    const dto = Object.assign(new ReplaceStaffWorkingHoursDto(), {
      hours: [interval, interval],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
  it("rejects unknown lifecycle statuses", async () => {
    const dto = Object.assign(new UpdateAppointmentStatusDto(), {
      status: "REOPENED",
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
