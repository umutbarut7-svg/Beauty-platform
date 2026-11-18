import { describe, expect, it } from "vitest";
import {
  parseSharedQuote,
  parseSharedReceipt,
  sameSharedPrice,
} from "./booking-contract";
const target = {
  businessId: "salon",
  serviceId: "color",
  professionalId: "staff",
};
const published = {
  business: { id: "salon", name: "Salon", timezone: "UTC" },
  locations: [{ id: "location", name: "Salon" }],
  service: {
    id: "color",
    name: "Color",
    price: "100",
    currency: "TRY",
    durationMinutes: 60,
  },
  professionals: [
    { id: "staff", displayName: "Stylist", price: "120", durationMinutes: 90 },
  ],
};
const slot = {
  startsAt: "2030-01-07T10:00:00.000Z",
  endsAt: "2030-01-07T11:30:00.000Z",
  staffId: "staff",
};
const receipt = {
  id: "booking",
  ...target,
  locationId: "location",
  startsAt: slot.startsAt,
  endsAt: slot.endsAt,
  price: "120",
  currency: "TRY",
  status: "PENDING",
};
describe("Web booking wire validation", () => {
  it("compares quoted decimal prices without floating point conversion", () => {
    expect(sameSharedPrice("1700.25", "1700.25")).toBe(true);
    expect(sameSharedPrice("1700", "1700.00")).toBe(true);
    expect(sameSharedPrice("0", "0.00")).toBe(true);
    expect(sameSharedPrice("1700.24", "1700.25")).toBe(false);
    expect(sameSharedPrice("-1", "-1")).toBe(false);
    expect(sameSharedPrice("1.001", "1.001")).toBe(false);
  });
  it("accepts only a current quote for the exact shared target", () => {
    expect(
      parseSharedQuote({ published, slots: [slot] }, target)?.slots,
    ).toEqual([slot]);
    for (const changed of [
      { businessId: "other" },
      { professionalId: "other" },
    ])
      expect(
        parseSharedQuote(
          { published, slots: [slot] },
          { ...target, ...changed },
        ),
      ).toBeNull();
  });
  it("rejects ambiguous, foreign and malformed availability", () => {
    for (const slots of [
      [slot, slot],
      [{ ...slot, staffId: "other" }],
      [{ ...slot, endsAt: slot.startsAt }],
      [{ ...slot, startsAt: "tomorrow" }],
    ])
      expect(parseSharedQuote({ published, slots }, target)).toBeNull();
    expect(parseSharedQuote({ published, slots: [] }, target)?.slots).toEqual(
      [],
    );
  });
  it("does not treat a pending receipt as confirmed or accept a foreign record", () => {
    expect(parseSharedReceipt(receipt, target)?.status).toBe("PENDING");
    for (const changed of [
      { businessId: "other" },
      { serviceId: "other" },
      { professionalId: "other" },
      { id: "bad/id" },
      { status: "SUCCESS" },
      { startsAt: "invalid" },
      { price: "NaN" },
    ])
      expect(parseSharedReceipt({ ...receipt, ...changed }, target)).toBeNull();
  });
});
