"use client";
import { useState } from "react";
import { ApiError, MvpApiClient } from "@beauty-platform/types";
import { AccountDeletionQueue } from "./AccountDeletionQueue";
import { VerificationReview } from "./VerificationReview";
type Business = { id: string; name: string; isVerified: boolean };
type Revenue = {
  status: string;
  currency?: string;
  grossRevenueMinor?: string;
  netRevenueMinor?: string;
};
export default function HomePage() {
  const [api] = useState(
    () =>
      new MvpApiClient(
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
      ),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState<Business | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSignedIn(false);
        setBusinesses([]);
        setSelected(null);
        setRevenue(null);
      }
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Bağlantı kurulamadı. Yeniden deneyin.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <p className="eyebrow">BEAUTY PLATFORM · OPERATIONS</p>
      <h1>Yönetim merkezi</h1>
      <p>İşletme durumunu ve kayda dayalı finansal görünümü inceleyin.</p>
      {busy && <p role="status">Yükleniyor…</p>}
      {message && <p role="alert">{message}</p>}
      {!signedIn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              api.clear();
              setBusinesses([]);
              setSelected(null);
              setRevenue(null);
              const user = await api.signIn("login", email, password);
              setPassword("");
              if (user.role !== "SUPER_ADMIN") {
                api.clear();
                setMessage(
                  "Platform yöneticisi yetkisi gerekiyor. İşletme hesabınızı mobil uygulamada kullanabilirsiniz.",
                );
                return;
              }
              setSignedIn(true);
            });
          }}
        >
          <label>
            E-posta
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Parola
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button disabled={busy}>Giriş yap</button>
        </form>
      ) : (
        <>
          <nav>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const values = await api.request<Business[]>("/businesses");
                  setBusinesses(values);
                  if (!values.length) setMessage("Henüz işletme yok.");
                })
              }
            >
              İşletmeleri yükle
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setSignedIn(false);
                  setBusinesses([]);
                  setSelected(null);
                  setRevenue(null);
                  await api.logout();
                })
              }
            >
              Çıkış yap
            </button>
          </nav>
          <AccountDeletionQueue api={api} busy={busy} run={run} />
          <section aria-label="İşletmeler">
            <h2>İşletmeler</h2>
            {!businesses.length && (
              <p>Henüz liste yüklenmedi veya işletme bulunmuyor.</p>
            )}
            {businesses.map((b) => (
              <button
                key={b.id}
                disabled={busy}
                onClick={() => {
                  setSelected(b);
                  setRevenue(null);
                }}
              >
                {b.name} · {b.isVerified ? "Doğrulanmış" : "Doğrulama bekliyor"}
              </button>
            ))}
          </section>
          {selected && (
            <section>
              <h2>{selected.name}</h2>
              <p>
                Doğrulama:{" "}
                {selected.isVerified
                  ? "Mevcut kayıt doğrulanmış"
                  : "İncelenmiş doğrulama politikası ve yetkili değerlendirme gerekiyor."}
              </p>
              <VerificationReview
                key={selected.id}
                api={api}
                businessId={selected.id}
                busy={busy}
                run={run}
                reviewed={(isVerified) => {
                  setSelected({ ...selected, isVerified });
                  setBusinesses((values) =>
                    values.map((b) =>
                      b.id === selected.id ? { ...b, isVerified } : b,
                    ),
                  );
                }}
              />
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setRevenue(
                      await api.request<Revenue>(
                        `/businesses/${selected.id}/financial/summary`,
                      ),
                    );
                  })
                }
              >
                Ledger özetini incele
              </button>
              {revenue &&
                (revenue.status === "AVAILABLE" ? (
                  <dl>
                    <dt>Brüt gelir · minor units</dt>
                    <dd>
                      {revenue.grossRevenueMinor} {revenue.currency}
                    </dd>
                    <dt>Net gelir · minor units</dt>
                    <dd>
                      {revenue.netRevenueMinor} {revenue.currency}
                    </dd>
                  </dl>
                ) : (
                  <p>
                    {revenue.status === "INSUFFICIENT_DATA"
                      ? "Finansal ledger kaydı yok. Tahsil edilmiş gelir gösterilemiyor."
                      : "Farklı para birimleri için doğrulanmış FX bağlamı gerekiyor."}
                  </p>
                ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
