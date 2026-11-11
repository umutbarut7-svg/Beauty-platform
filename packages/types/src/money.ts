/** Format ledger integer minor units without converting large integers to floats. */
export function formatMinorUnits(
  value: string | undefined,
  currency: string | undefined,
) {
  if (!value || !currency || !/^-?\d+$/.test(value)) return "—";
  try {
    const formatter = new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const amount = BigInt(value);
    const absolute = amount < 0n ? -amount : amount;
    const divisor = 10n ** BigInt(digits);
    const whole = absolute / divisor;
    const fraction = String(absolute % divisor).padStart(digits, "0");
    const parts = formatter.formatToParts(amount < 0n ? -whole : whole);
    const text = parts
      .map((part) => (part.type === "fraction" ? fraction : part.value))
      .join("");
    return amount < 0n && whole === 0n ? `-${text}` : text;
  } catch {
    return "—";
  }
}
