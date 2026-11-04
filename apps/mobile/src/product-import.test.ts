import { describe, expect, it } from "vitest";
import { parseProductRows } from "../product-import";
describe("shared product batch parsing", () => {
  it("accepts a representative 50-row sheet and exact comma decimals", () => {
    const text = Array.from(
      { length: 50 },
      (_, i) => `code-${i}\tÜrün ${i}\tMarka\t2000,50\tTRY\tML\t0,125`,
    ).join("\n");
    const rows = parseProductRows(text);
    expect(rows).toHaveLength(50);
    expect(rows[0]).toMatchObject({
      sku: "CODE-0",
      price: "2000.50",
      lowStockThreshold: "0.125",
    });
  });
  it("rejects duplicate codes, malformed columns, excessive rows and fractional counts", () => {
    const row = "code\tÜrün\t\t2000\tTRY\tUNIT\t2";
    for (const text of [
      "",
      `${row}\n${row}`,
      Array(51).fill(row).join("\n"),
      row.replace("\t2", "\t0.5"),
      row.replace("2000", "2.000,50"),
      "code\tÜrün",
    ])
      expect(() => parseProductRows(text)).toThrow();
  });
});
