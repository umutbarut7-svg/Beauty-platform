"use client";
import { useRef, useState } from "react";
import {
  ApiError,
  MvpApiClient,
  type OrzellShareTarget,
  type PublishedShareService,
} from "@beauty-platform/types";
import {
  parseSharedQuote,
  parseSharedReceipt,
  sameSharedPrice,
  type SharedBookingReceipt,
} from "./booking-contract";

export function SharedBooking({
  apiBase,
  target,
  published,
}: {
  apiBase: string;
  target: OrzellShareTarget;
  published: PublishedShareService;
}) {
  const [api] = useState(() => new MvpApiClient(apiBase));
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [message, setMessage] = useState("");
  const [locationId, setLocationId] = useState("");
  const [professionalId, setProfessionalId] = useState(
    target.professionalId ?? "",
  );
  const [date, setDate] = useState("");
  const [timezone, setTimezone] = useState(published.business.timezone);
  const [quote, setQuote] = useState<ReturnType<typeof parseSharedQuote>>(null);
  const [startsAt, setStartsAt] = useState("");
  const [receipts, setReceipts] = useState<SharedBookingReceipt[]>([]);
  function clearQuote() {
    setQuote(null);
    setStartsAt("");
  }
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        api.clear();
        setSignedIn(false);
        setReceipts([]);
        clearQuote();
      }
      setMessage(
        error instanceof ApiError && error.status < 500
          ? error.message
          : "İşlem sonucu doğrulanamadı. Yeniden talep göndermeden önce randevularınızı kontrol edin.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const time = (value: string) =>
    new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  const selectedStaff = quote?.published.professionals.find(
    (staff) => staff.id === professionalId,
  );
  const selectedSlot = quote?.slots.find((slot) => slot.startsAt === startsAt);
  if (!published.locations.length || !published.professionals.length)
    return <p>Bu hizmet için web randevusu şu anda kullanılamıyor.</p>;
  return (
    <section aria-label="Web randevusu">
      <h2>Randevu talebi</h2>
      {!signedIn ? (
        <>
          <p>
            Hizmet bilgilerini inceleyebilirsiniz. Uygun saatleri görmek ve
            kendi adınıza talep göndermek için giriş yapın.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                clearQuote();
                setReceipts([]);
                try {
                  await api.signIn(mode, email, password);
                  setSignedIn(true);
                } finally {
                  setPassword("");
                }
              });
            }}
          >
            <label>
              E-posta
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Parola
              <input
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "register" ? 12 : 1}
                required
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy} type="submit">
              {mode === "login" ? "Giriş yap" : "Hesap oluştur"}
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setPassword("");
              }}
            >
              {mode === "login"
                ? "Yeni hesap oluştur"
                : "Mevcut hesabımla giriş yap"}
            </button>
          </form>
        </>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                try {
                  await api.logout();
                } finally {
                  setSignedIn(false);
                  setReceipts([]);
                  clearQuote();
                }
              })
            }
          >
            Çıkış yap
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                clearQuote();
                const params = new URLSearchParams({
                  businessId: target.businessId,
                  serviceId: target.serviceId,
                  professionalId,
                  locationId,
                  date,
                });
                const next = parseSharedQuote(
                  await api.request<unknown>(
                    `/discovery/shared-service/availability?${params}`,
                  ),
                  { ...target, professionalId },
                );
                if (!next) throw new Error("Invalid quote");
                setQuote(next);
                setTimezone(next.published.business.timezone);
                if (!next.slots.length)
                  setMessage(
                    "Bu seçim için uygun saat bulunamadı. Başka bir gün veya uzman seçin.",
                  );
              });
            }}
          >
            <label>
              Konum
              <select
                aria-label="Konum"
                required
                disabled={busy}
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  clearQuote();
                }}
              >
                <option value="">Konum seçin</option>
                {published.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Uzman
              <select
                aria-label="Uzman"
                required
                disabled={busy || Boolean(target.professionalId)}
                value={professionalId}
                onChange={(e) => {
                  setProfessionalId(e.target.value);
                  clearQuote();
                }}
              >
                <option value="">Uzman seçin</option>
                {published.professionals.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Gün
              <input
                type="date"
                required
                disabled={busy}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearQuote();
                }}
              />
            </label>
            <p>Saatler {timezone} saat dilimindedir.</p>
            <button type="submit" disabled={busy}>
              Uygun saatleri göster
            </button>
          </form>
          {quote && quote.slots.length > 0 && (
            <>
              <label>
                Uygun saat
                <select
                  aria-label="Uygun saat"
                  disabled={busy}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                >
                  <option value="">Saat seçin</option>
                  {quote.slots.map((slot) => (
                    <option key={slot.startsAt} value={slot.startsAt}>
                      {time(slot.startsAt)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedSlot && selectedStaff && (
                <>
                  <p>
                    {quote.published.service.name} · {selectedStaff.displayName}{" "}
                    · {time(selectedSlot.startsAt)} · {selectedStaff.price}{" "}
                    {quote.published.service.currency} ·{" "}
                    {selectedStaff.durationMinutes} dakika
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const input = {
                          idempotencyKey: globalThis.crypto.randomUUID(),
                          businessId: target.businessId,
                          serviceId: target.serviceId,
                          professionalId,
                          locationId,
                          startsAt: selectedSlot.startsAt,
                          expectedPrice: selectedStaff.price,
                          expectedCurrency: quote.published.service.currency,
                          expectedDurationMinutes:
                            selectedStaff.durationMinutes,
                        };
                        // Clear the draft before the only write attempt. A lost response never triggers retry.
                        clearQuote();
                        const receipt = parseSharedReceipt(
                          await api.request<unknown>(
                            "/discovery/shared-service/bookings",
                            "POST",
                            input,
                          ),
                          { ...target, professionalId },
                        );
                        if (
                          !receipt ||
                          receipt.status !== "PENDING" ||
                          receipt.startsAt !== input.startsAt ||
                          receipt.locationId !== input.locationId ||
                          !sameSharedPrice(
                            receipt.price,
                            input.expectedPrice,
                          ) ||
                          receipt.currency !== input.expectedCurrency ||
                          Date.parse(receipt.endsAt) -
                            Date.parse(receipt.startsAt) !==
                            input.expectedDurationMinutes * 60_000
                        )
                          throw new Error("Unverified receipt");
                        setReceipts([receipt]);
                        setMessage(
                          "Randevu talebiniz alındı. İşletme onayı bekleniyor.",
                        );
                      })
                    }
                  >
                    Randevu talebini gönder
                  </button>
                </>
              )}
            </>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const params = new URLSearchParams({
                  businessId: target.businessId,
                  serviceId: target.serviceId,
                  ...(target.professionalId
                    ? { professionalId: target.professionalId }
                    : {}),
                });
                const response = await api.request<{ items: unknown[] }>(
                  `/discovery/shared-service/bookings?${params}`,
                );
                if (
                  !Array.isArray(response.items) ||
                  response.items.length > 50
                )
                  throw new Error("Invalid bookings");
                const rows = response.items.map((item) =>
                  parseSharedReceipt(item, target),
                );
                if (rows.some((row) => !row))
                  throw new Error("Invalid receipt");
                setReceipts(
                  rows.filter(
                    (row): row is SharedBookingReceipt => row !== null,
                  ),
                );
                if (!rows.length)
                  setMessage(
                    "Bu hizmet için hesabınıza ait randevu bulunamadı.",
                  );
              })
            }
          >
            Randevularımı kontrol et
          </button>
          {receipts.map((receipt) => (
            <article key={receipt.id} aria-label="Randevu kaydı">
              <p>
                {time(receipt.startsAt)} · {receipt.price} {receipt.currency}
              </p>
              <p>
                {receipt.status === "PENDING"
                  ? "İşletme onayı bekleniyor"
                  : receipt.status === "CONFIRMED"
                    ? "İşletme tarafından onaylandı"
                    : receipt.status === "CANCELLED"
                      ? "Randevu iptal edildi"
                      : "Randevu durumu güncellendi"}
              </p>
              <p>Kayıt: {receipt.id}</p>
              {["PENDING", "CONFIRMED"].includes(receipt.status) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = parseSharedReceipt(
                        await api.request<unknown>(
                          `/discovery/shared-service/bookings/${receipt.id}/cancel`,
                          "POST",
                          { businessId: receipt.businessId },
                        ),
                        target,
                      );
                      if (
                        !result ||
                        result.id !== receipt.id ||
                        result.status !== "CANCELLED"
                      )
                        throw new Error("Unverified cancellation");
                      setReceipts((rows) =>
                        rows.map((row) =>
                          row.id === result.id ? result : row,
                        ),
                      );
                      setMessage("Randevunuz iptal edildi.");
                    })
                  }
                >
                  Bu randevuyu iptal et
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {busy && <p role="status">İşleniyor…</p>}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
