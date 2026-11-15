import { parseOrzellShareLink } from "@beauty-platform/types";

/** Public mobile-web entry point. No booking is claimed until a verified service lookup exists. */
export default async function SharedServicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const origin = process.env.ORZELL_PUBLIC_ORIGIN;
  if (!origin) {
    return <main><h1>ORZELL</h1><p>Paylaşım bağlantıları henüz yapılandırılmadı.</p></main>;
  }
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) query.append(key, item);
    else if (value !== undefined) query.append(key, value);
  }
  const target = parseOrzellShareLink(`${origin}/discover/service?${query}`, origin);
  if (!target) {
    return <main><h1>Geçersiz bağlantı</h1><p>Lütfen işletmenin güncel ORZELL bağlantısını kullanın.</p></main>;
  }
  return (
    <main style={{ maxWidth: 640, margin: "5rem auto", padding: "1.5rem" }}>
      <p>ORZELL · Keşfet</p>
      <h1>Beğendiğiniz hizmete bir adım daha yakınsınız</h1>
      <p>Bağlantı doğrulandı. Hizmetin güncel fiyatı, uzmanı ve müsaitliği işletme verileriyle doğrulandıktan sonra randevu alınabilecek.</p>
      <p>Hizmet kodu: {target.serviceId}</p>
      <p>İşletme kodu: {target.businessId}</p>
      <p>Randevu işlemi henüz bu önizleme sayfasında etkin değil.</p>
    </main>
  );
}
