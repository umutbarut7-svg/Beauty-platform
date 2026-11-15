import { parseOrzellShareLink } from "@beauty-platform/types";

/** Keep the pre-integration placeholder out of search indexes. */
export const metadata = {
  title: "ORZELL · Hizmet keşfi",
  robots: { index: false, follow: false },
};

type PublishedService = {
  name: string;
  price: string;
  currency: string;
  durationMinutes: number;
};
type PublishedBusiness = { name: string; service: PublishedService };

/** Read-only published discovery; fail closed on missing or ambiguous records. */
async function resolvePublishedService(
  businessId: string,
  serviceId: string,
): Promise<PublishedBusiness | null> {
  const apiOrigin = process.env.ORZELL_PUBLIC_API_ORIGIN;
  if (!apiOrigin) return null;
  let base: URL;
  try {
    base = new URL(apiOrigin);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/"
    )
      return null;
  } catch {
    return null;
  }
  const url = new URL("/discovery/services", base);
  url.searchParams.set("businessId", businessId);
  url.searchParams.set("serviceId", serviceId);
  url.searchParams.set("limit", "10");
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("items" in payload))
      return null;
    const items = (payload as { items: unknown }).items;
    if (!Array.isArray(items)) return null;
    const matches = items.filter(
      (item): item is {
        businessId: string;
        name: string;
        services: PublishedService[];
      } =>
        item !== null &&
        typeof item === "object" &&
        item.businessId === businessId &&
        typeof item.name === "string" &&
        Array.isArray(item.services),
    );
    const match = matches[0];
    if (matches.length !== 1 || !match) return null;
    const services = match.services.filter(
      (service) =>
        service !== null &&
        typeof service === "object" &&
        "id" in service &&
        service.id === serviceId &&
        typeof service.name === "string" &&
        typeof service.price === "string" &&
        typeof service.currency === "string" &&
        typeof service.durationMinutes === "number",
    );
    const service = services[0];
    if (services.length !== 1 || !service) return null;
    return { name: match.name, service };
  } catch {
    return null;
  }
}

/** Public mobile-web entry point. No booking is claimed until a verified service lookup exists. */
export default async function SharedServicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const origin = process.env.ORZELL_PUBLIC_ORIGIN;
  if (!origin) {
    return (
      <main>
        <h1>ORZELL</h1>
        <p>Paylaşım bağlantıları henüz yapılandırılmadı.</p>
      </main>
    );
  }
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value))
      for (const item of value) query.append(key, item);
    else if (value !== undefined) query.append(key, value);
  }
  const target = parseOrzellShareLink(
    `${origin}/discover/service?${query}`,
    origin,
  );
  if (!target) {
    return (
      <main>
        <h1>Geçersiz bağlantı</h1>
        <p>Lütfen işletmenin güncel ORZELL bağlantısını kullanın.</p>
      </main>
    );
  }
  // Do not silently drop professional/result targeting before those records
  // have a verified, tenant-scoped public resolver.
  if (target.professionalId || target.resultId) {
    return (
      <main>
        <h1>Bu paylaşım henüz desteklenmiyor</h1>
        <p>İşletmeden güncel hizmet bağlantısını isteyin.</p>
      </main>
    );
  }
  const published = await resolvePublishedService(
    target.businessId,
    target.serviceId,
  );
  if (!published) {
    return (
      <main>
        <h1>Hizmet şu anda görüntülenemiyor</h1>
        <p>İşletmenin güncel ORZELL bağlantısını kontrol edin.</p>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 640, margin: "5rem auto", padding: "1.5rem" }}>
      <p>ORZELL · Keşfet</p>
      <h1>{published.service.name}</h1>
      <p>{published.name}</p>
      <p>
        {published.service.price} {published.service.currency} ·{" "}
        {published.service.durationMinutes} dakika
      </p>
      <p>
        Randevu işlemi henüz bu önizleme sayfasında etkin değil.
        Güncel müsaitlik doğrulanmadan rezervasyon oluşturulmaz.
      </p>
    </main>
  );
}
