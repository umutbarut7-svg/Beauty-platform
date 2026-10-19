import { describe, expect, it } from "vitest";
import { canTransitionAppointment } from "./status-transitions.js";

describe("appointment status transitions", () => {
  it("allows the defined forward lifecycle", () => {
    expect(canTransitionAppointment("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransitionAppointment("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(canTransitionAppointment("CHECKED_IN", "IN_PROGRESS")).toBe(true);
    expect(canTransitionAppointment("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransitionAppointment("PENDING", "NO_SHOW")).toBe(true);
    expect(canTransitionAppointment("PENDING", "CANCELLED")).toBe(true);
  });
  it("keeps terminal states terminal", () => {
    expect(canTransitionAppointment("COMPLETED", "CONFIRMED")).toBe(false);
    expect(canTransitionAppointment("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransitionAppointment("NO_SHOW", "CONFIRMED")).toBe(false);
  });
});
