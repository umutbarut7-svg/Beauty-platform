import type { Metadata } from "next";
import { cache } from "react";
import {
  createOrzellShareLink,
  parseOrzellShareLink,
} from "@beauty-platform/types";
import { SharedBooking } from "./SharedBooking";
import { publicApiBase, resolvePublishedService } from "./published-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function encodeQuery(params: Awaited<PageProps["searchParams"]>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) query.append(key, item);
    else if (value !== undefined) query.append(key, value);
  }
  return query.toString();
}

const loadService = cache(async (query: string) => {
  const origin = process.env.ORZELL_PUBLIC_ORIGIN;
  const target = origin
    ? parseOrzellShareLink(
        `${origin.replace(/\/$/, "")}/discover/service?${query}`,
        origin,
      )
    : null;
  const published =
    target && !target.resultId
      ? await resolvePublishedService(
          target,
          process.env.ORZELL_PUBLIC_API_ORIGIN,
          fetch,
          process.env.ORZELL_PUBLIC_API_PATH_PREFIX ?? "",
        )
      : null;
  return { origin, target, published };
});

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { origin, target, published } = await loadService(
    encodeQuery(await searchParams),
  );
  const defaults = {
    title: "ORZELL · Hizmet keşfi",
    description: "ORZELL hizmet paylaşımı",
    robots: { index: false, follow: false },
  };
  if (!origin || !target || !published) return defaults;
  const title = `${published.service.name} · ${published.business.name}`;
  const description = "Hizmet ayrıntılarını ORZELL’de görüntüleyin.";
  const brandImage = {
    url: new URL("/orzell-original-reference.jpg", origin).href,
    width: 1254,
    height: 1254,
    alt: "ORZELL",
  };
  return {
    ...defaults,
    title,
    description,
    openGraph: {
      type: "website",
      images: [brandImage],
      siteName: "ORZELL",
      locale: "tr_TR",
      title,
      description,
      url: createOrzellShareLink(origin, target),
    },
    twitter: { card: "summary", title, description, images: [brandImage] },
  };
}

export default async function SharedServicePage({ searchParams }: PageProps) {
  const { origin, target, published } = await loadService(
    encodeQuery(await searchParams),
  );
  if (!origin)
    return (
      <main>
        <h1>ORZELL</h1>
        <p>Paylaşım bağlantıları henüz yapılandırılmadı.</p>
      </main>
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
