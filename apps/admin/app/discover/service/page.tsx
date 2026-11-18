import { parseOrzellShareLink } from "@beauty-platform/types";
import { SharedBooking } from "./SharedBooking";
import { publicApiBase, resolvePublishedService } from "./published-service";

export const dynamic = "force-dynamic";

/** Keep the pre-integration placeholder out of search indexes. */
export const metadata = {
  title: "ORZELL · Hizmet keşfi",
  robots: { index: false, follow: false },
};

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
    if (Array.isArray(value)) for (const item of value) query.append(key, item);
    else if (value !== undefined) query.append(key, value);
  }
  const target = parseOrzellShareLink(
    `${origin.replace(/\/$/, "")}/discover/service?${query}`,
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
  // Result photos stay closed until separate public-publication permission exists.
  if (target.resultId) {
    return (
      <main>
        <h1>Bu paylaşım henüz desteklenmiyor</h1>
        <p>İşletmeden güncel hizmet bağlantısını isteyin.</p>
      </main>
    );
  }
  const published = await resolvePublishedService(
    target,
    process.env.ORZELL_PUBLIC_API_ORIGIN,
    fetch,
    process.env.ORZELL_PUBLIC_API_PATH_PREFIX ?? "",
  );
  if (!published) {
    return (
      <main>
        <h1>Hizmet şu anda görüntülenemiyor</h1>
        <p>İşletmenin güncel ORZELL bağlantısını kontrol edin.</p>
      </main>
    );
  }
  const apiBase = publicApiBase(
    process.env.ORZELL_PUBLIC_API_ORIGIN,
    process.env.ORZELL_PUBLIC_API_PATH_PREFIX ?? "",
  );
  return (
    <main style={{ maxWidth: 640, margin: "5rem auto", padding: "1.5rem" }}>
      <div className="brand" role="img" aria-label="ORZELL">
        <span className="brand-emblem" aria-hidden="true" />
        <span className="brand-letters" aria-hidden="true">
          RZELL
        </span>
      </div>
      <p className="eyebrow">ORZELL · Keşfet</p>
      <h1>{published.service.name}</h1>
      <p>{published.business.name}</p>
      <p>
        {published.service.price} {published.service.currency} ·{" "}
        {published.service.durationMinutes} dakika
      </p>
      {published.professionals.length > 0 && (
        <section aria-label="Hizmeti sunan uzmanlar">
          <h2>Uzmanlar</h2>
          {published.professionals.map((staff) => (
            <p key={staff.id}>
              {staff.displayName} · {staff.price} {published.service.currency} ·{" "}
              {staff.durationMinutes} dakika
            </p>
          ))}
        </section>
      )}
      {process.env.ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED === "true" &&
      apiBase ? (
        <SharedBooking
          key={`${target.businessId}:${target.serviceId}:${target.professionalId ?? ""}`}
          apiBase={apiBase}
          target={target}
          published={published}
        />
      ) : (
        <p>Bu hizmet için web randevusu şu anda kullanılamıyor.</p>
      )}
    </main>
  );
}
