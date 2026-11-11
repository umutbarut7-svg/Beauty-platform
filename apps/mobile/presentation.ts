export function todayIso(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const statusLabels: Record<string, string> = {
  PENDING: "Onay bekliyor",
  CONFIRMED: "Onaylandı",
  CHECKED_IN: "Müşteri geldi",
  IN_PROGRESS: "İşlem sürüyor",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal edildi",
  NO_SHOW: "Katılım olmadı",
};
export const outcomeLabels: Record<string, string> = {
  SATISFIED: "Memnun",
  UNSATISFIED: "Memnun değil",
  UNSURE: "Kararsız",
};
export function formatPrice(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Fiyat bilgisi alınamadı";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${value} ${currency}`;
  }
}

export { formatMinorUnits } from "@beauty-platform/types";

/** Validate calendar days without Date's silent overflow (for example February 31). */
export function bookingDateError(value: string, today = todayIso()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return "Tarihi YYYY-MM-DD biçiminde girin.";
  const parsed = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    return "Geçerli bir takvim tarihi girin.";
  if (value < today) return "Bugün veya ileri bir tarih seçin.";
  return null;
}
