import type { ProductImportRow, InventoryUnit } from "@beauty-platform/types";

/** Tab-separated paste from a sheet; decimals accept a comma, never thousands separators. */
export function parseProductRows(text: string): ProductImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (!text.trim() || lines.length > 50)
    throw new Error("Tek seferde 1–50 ürün ekleyebilirsin.");
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const columns = line.split("\t").map((value) => value.trim());
    const [
      rawSku = "",
      name = "",
      brand = "",
      rawPrice = "",
      currency = "",
      unit = "",
      rawThreshold = "",
    ] = columns;
    const sku = rawSku.toUpperCase(),
      price = rawPrice.replace(",", "."),
      lowStockThreshold = rawThreshold.replace(",", ".");
    if (
      columns.length !== 7 ||
      !/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku) ||
      !name ||
      name.length > 120 ||
      brand.length > 120 ||
      !/^\d{1,10}(?:\.\d{1,2})?$/.test(price) ||
      !/^[A-Z]{3}$/.test(currency) ||
      !["UNIT", "ML", "G"].includes(unit) ||
      !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(lowStockThreshold) ||
      (unit === "UNIT" && !/^\d+(?:\.0{1,3})?$/.test(lowStockThreshold))
    )
      throw new Error(
        `${index + 1}. satırdaki kod, ad, fiyat, para birimi, birim veya eşik bilgisini kontrol et.`,
      );
    if (seen.has(sku))
      throw new Error(
        `${index + 1}. satırdaki ürün kodu listede tekrar ediyor.`,
      );
    seen.add(sku);
    return {
      sku,
      name,
      ...(brand ? { brand } : {}),
      price,
      currency,
      unit: unit as InventoryUnit,
      lowStockThreshold,
    };
  });
}
