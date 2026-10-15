export function normalizeSearchText(value?: string): string | undefined {
  const normalized = value
    ?.normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR");
  return normalized || undefined;
}
