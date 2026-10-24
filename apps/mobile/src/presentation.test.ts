import { describe, expect, it } from "vitest";
import {
  bookingDateError,
  formatMinorUnits,
  formatPrice,
} from "../presentation";

describe("customer and ledger prices", () => {
  it("keeps catalogue major units distinct from ledger minor units", () => {
    expect(formatPrice("250.75", "TRY")).toContain("250,75");
    expect(formatMinorUnits("25075", "TRY")).toContain("250,75");
    expect(formatMinorUnits("250", "TRY")).toContain("2,50");
  });
  it("uses each currency's fraction digits", () => {
    expect(formatMinorUnits("25075", "JPY")).toContain("25.075");
    expect(formatMinorUnits("25075", "KWD")).toContain("25,075");
  });
  it("preserves ledger values beyond Number safe integer precision", () => {
    expect(formatMinorUnits("900719925474099199", "TRY")).toContain(
      "9.007.199.254.740.991,99",
    );
  });
  it("keeps negative subunit signs and rejects missing or malformed data", () => {
    expect(formatMinorUnits("-1", "TRY")).toContain("-₺0,01");
    expect(formatMinorUnits("0", "TRY")).toContain("0,00");
    expect(formatMinorUnits("12.34", "TRY")).toBe("—");
    expect(formatMinorUnits(undefined, "TRY")).toBe("—");
    expect(formatMinorUnits("12", undefined)).toBe("—");
  });
});

describe("booking calendar validation", () => {
  it("rejects impossible calendar days and accepts leap days", () => {
    for (const value of [
      "2026-02-31",
      "2026-04-31",
      "2026-13-01",
      "2026-00-01",
      "2026-01-00",
      "2025-02-29",
    ])
      expect(bookingDateError(value, "2025-01-01")).toBe(
        "Geçerli bir takvim tarihi girin.",
      );
    expect(bookingDateError("2028-02-29", "2026-10-24")).toBeNull();
  });
  it("allows today, blocks past days, and explains malformed input", () => {
    expect(bookingDateError("2026-10-24", "2026-10-24")).toBeNull();
    expect(bookingDateError("2026-10-23", "2026-10-24")).toBe(
      "Bugün veya ileri bir tarih seçin.",
    );
    expect(bookingDateError("24.10.2026", "2026-10-24")).toBe(
      "Tarihi YYYY-MM-DD biçiminde girin.",
    );
  });
});
