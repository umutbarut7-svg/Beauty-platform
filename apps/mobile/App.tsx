import { BusinessSetup } from "./BusinessSetup";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ApiError,
  BUSINESS_MVP_STEPS,
  CUSTOMER_MVP_STEPS,
  MvpApiClient,
  type DiscoverySearchResponse,
  type MvpBooking,
  type MvpCatalog,
  type MvpResult,
} from "@beauty-platform/types";

const api = new MvpApiClient(
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001",
);
type Business = {
  id: string;
  name: string;
  isVerified: boolean;
  description?: string;
};
type Slot = { startsAt: string; staffId: string };
export default function App() {
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"customer" | "business">("customer");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [intent, setIntent] = useState("");
  const [target, setTarget] = useState("");
  const [matches, setMatches] = useState<DiscoverySearchResponse["items"]>([]);
  const [catalog, setCatalog] = useState<MvpCatalog | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<MvpBooking[]>([]);
  const [selected, setSelected] = useState<MvpBooking | null>(null);
  const [result, setResult] = useState<MvpResult | null>(null);
  const [passport, setPassport] = useState<MvpResult[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [revenue, setRevenue] = useState<{
    status: string;
    currency?: string;
    grossRevenueMinor?: string;
    netRevenueMinor?: string;
  } | null>(null);
  const keys = useRef(new Map<string, string>());
  const reset = () => {
    setMode("customer");
    setName("");
    setServiceId("");
    setLocationId("");
    setStaffId("");
    setSlots([]);
    setDate("");
    setMatches([]);
    setCatalog(null);
    setBookings([]);
    setSelected(null);
    setResult(null);
    setPassport([]);
    setBusinesses([]);
    setBusiness(null);
    setRevenue(null);
    setIntent("");
    setTarget("");
    setSummary("");
    keys.current.clear();
  };
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        reset();
      }
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Bağlantı kurulamadı. Yeniden deneyin.",
      );
    } finally {
      setBusy(false);
    }
  }
  const key = (operation: string) => {
    let value = keys.current.get(operation);
    if (!value) {
      value = `mvp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      keys.current.set(operation, value);
    }
    return value;
  };
  const button = (label: string, action: () => Promise<void>) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      style={[styles.button, busy && { opacity: 0.5 }]}
      onPress={() => void run(action)}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  const input = (
    label: string,
    value: string,
    change: (s: string) => void,
    secure = false,
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      value={value}
      onChangeText={change}
      secureTextEntry={secure}
      autoCapitalize="none"
      editable={!busy}
      style={styles.input}
      maxLength={secure ? 128 : 2000}
    />
  );
  async function choose(b: Business) {
    setCatalog(null);
    setSlots([]);
    setServiceId("");
    setStaffId("");
    setLocationId("");
    const c = await api.request<MvpCatalog>(`/mvp/v1/catalog/${b.id}`);
    setCatalog(c);
  }
  async function loadBookings() {
    setBookings(
      mode === "customer"
        ? (await api.request<{ items: MvpBooking[] }>("/mvp/v1/bookings")).items
        : business
          ? await api.request<MvpBooking[]>(
              `/businesses/${business.id}/appointments`,
            )
          : [],
    );
  }
  const resultPath = selected
    ? `/mvp/v1/businesses/${selected.businessId}/appointments/${selected.id}`
    : "";
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>BEAUTY PLATFORM · PRE-LAUNCH</Text>
        <Text style={styles.title}>Bakım yolculuğunuz</Text>
        <Text style={styles.body}>
          Gerçek müsaitlik, kayıtlı sonuçlar ve size ait bir bakım geçmişi.
        </Text>
        {busy && <ActivityIndicator accessibilityLabel="Yükleniyor" />}
        {notice ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            {notice}
          </Text>
        ) : null}
        {!user ? (
          <View style={styles.card}>
            <Text style={styles.heading}>Hesabınıza giriş yapın</Text>
            {input("E-posta", email, setEmail)}
            {input("Parola", password, setPassword, true)}
            {button("Giriş yap", async () => {
              reset();
              const u = await api.signIn("login", email, password);
              setPassword("");
              setUser(u);
            })}
            {button("Hesap oluştur", async () => {
              reset();
              const u = await api.signIn("register", email, password);
              setPassword("");
              setUser(u);
            })}
            <Text style={styles.body}>
              Fotoğraf ve görsel analiz, incelenmiş gizlilik politikası ve
              sağlayıcı bağlantısı hazır olmadan kullanılamaz.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.row}>
              {button("Müşteri", async () => {
                reset();
                setMode("customer");
              })}
              {button("İşletme", async () => {
                reset();
                setMode("business");
              })}
              {button("Çıkış yap", async () => {
                setUser(null);
                reset();
                await api.logout();
              })}
            </View>
            <Text style={styles.small}>
              {(mode === "customer"
                ? CUSTOMER_MVP_STEPS
                : BUSINESS_MVP_STEPS
              ).join(" → ")}
            </Text>
            {mode === "customer" ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.heading}>
                    Neyi değiştirmek istersiniz?
                  </Text>
                  {input("İsteğiniz", intent, setIntent)}
                  {input("Hedefiniz", target, setTarget)}
                  <Text style={styles.notice}>
                    Fotoğraf, akıllı sorular ve görsel analiz şu anda
                    kullanılamıyor. Sonuç veya AI önerisi üretilmiş değildir.
                    Mevcut katalogdan randevu seçebilirsiniz.
                  </Text>
                  {button("Katalogda ara", async () => {
                    const response = await api.request<DiscoverySearchResponse>(
                      `/discovery/search?query=${encodeURIComponent(intent)}&limit=20`,
                    );
                    setMatches(response.items);
                    setNotice(
                      response.items.length
                        ? "Katalog sonuçları listelendi; AI görsel eşleşmesi değildir."
                        : "Uygun sonuç bulunamadı.",
                    );
                  })}
                  {matches.map((b) => (
                    <View key={b.businessId}>
                      <Text style={styles.heading}>{b.name}</Text>
                      <Text>
                        {b.verified ? "Doğrulanmış" : "Doğrulanma bilgisi yok"}{" "}
                        · {b.city ?? "Konum belirtilmemiş"}
                      </Text>
                      {button(`${b.name} hizmetlerini gör`, () =>
                        choose({
                          id: b.businessId,
                          name: b.name,
                          isVerified: b.verified,
                        }),
                      )}
                    </View>
                  ))}
                </View>
                {catalog && (
                  <View style={styles.card}>
                    <Text style={styles.heading}>{catalog.name}</Text>
                    <Text>Hizmet</Text>
                    {catalog.services.map((s) =>
                      button(
                        `${s.name} · ${s.price} ${s.currency}${serviceId === s.id ? " ✓" : ""}`,
                        async () => {
                          setServiceId(s.id);
                          setStaffId("");
                          setSlots([]);
                        },
                      ),
                    )}
                    <Text>Konum</Text>
                    {catalog.locations.map((l) =>
                      button(
                        `${l.name}${locationId === l.id ? " ✓" : ""}`,
                        async () => {
                          setLocationId(l.id);
                          setSlots([]);
                        },
                      ),
                    )}
                    <Text>Profesyonel</Text>
                    {catalog.staff
                      .filter((s) =>
                        s.services.some((x) => x.serviceId === serviceId),
                      )
                      .map((s) =>
                        button(
                          `${s.displayName}${staffId === s.id ? " ✓" : ""}`,
                          async () => {
                            setStaffId(s.id);
                            setSlots([]);
                          },
                        ),
                      )}
                    {input("Tarih (YYYY-MM-DD)", date, setDate)}
                    {button("Müsait saatleri bul", async () => {
                      setSlots([]);
                      const q = new URLSearchParams({
                        locationId,
                        serviceId,
                        date,
                        ...(staffId ? { staffMemberId: staffId } : {}),
                      });
                      const response = await api.request<Slot[]>(
                        `/businesses/${catalog.id}/availability?${q}`,
                      );
                      setSlots(response);
                      if (!response.length)
                        setNotice("Bu seçim için müsait saat yok.");
                    })}
                    {slots.map((slot, i) =>
                      button(
                        `Rezerve et: ${new Date(slot.startsAt).toLocaleString()} (${i + 1})`,
                        async () => {
                          await api.request(
                            `/businesses/${catalog.id}/appointments`,
                            "POST",
                            {
                              locationId,
                              serviceId,
                              staffMemberId: slot.staffId,
                              startsAt: slot.startsAt,
                            },
                          );
                          setSlots([]);
                          setNotice("Randevu kaydedildi. Tahsilat yapılmadı.");
                          await loadBookings();
                        },
                      ),
                    )}
                  </View>
                )}
                <View style={styles.card}>
                  <Text style={styles.heading}>Beauty Passport</Text>
                  {button("Bakım geçmişimi yükle", async () => {
                    const value = await api.request<{ items: MvpResult[] }>(
                      "/mvp/v1/passport",
                    );
                    setPassport(value.items);
                    if (!value.items.length)
                      setNotice(
                        "Henüz yayınlanmış sonuç yok. Memnuniyet kaydından sonra geçmişiniz güncellenir.",
                      );
                  })}
                  {passport.map((p) => (
                    <View key={p.id}>
                      <Text>
                        {new Date(p.createdAt).toLocaleDateString()} ·{" "}
                        {p.summary}
                      </Text>
                      <Text>
                        Memnuniyet:{" "}
                        {p.satisfaction?.outcome ?? "Henüz bildirilmedi"}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.card}>
                <Text style={styles.heading}>İşletmeniz</Text>
                {input("İşletme / profil adı", name, setName)}
                {button("İşletme oluştur", async () => {
                  const b = await api.request<Business>("/businesses", "POST", {
                    name,
                  });
                  setBusiness(b);
                  setNotice(
                    "İşletme kaydedildi; doğrulama tamamlanmış değildir.",
                  );
                })}
                {button("İşletmelerimi yükle", async () => {
                  const values = await api.request<Business[]>("/businesses");
                  setBusinesses(values);
                  if (!values.length) setNotice("Henüz işletmeniz yok.");
                })}
                {businesses.map((b) =>
                  button(b.name, async () => {
                    setBusiness(b);
                    setBookings([]);
                    setSelected(null);
                    setResult(null);
                    setRevenue(null);
                    setName(b.name);
                  }),
                )}
                {business && (
                  <>
                    <Text style={styles.heading}>{business.name}</Text>
                    <Text>
                      Verification:{" "}
                      {business.isVerified
                        ? "Doğrulanmış"
                        : "Doğrulama bekleniyor"}
                    </Text>
                    {button("Profil adını kaydet", async () => {
                      setBusiness(
                        await api.request<Business>(
                          `/businesses/${business.id}`,
                          "PATCH",
                          { name },
                        ),
                      );
                      setNotice("Profil kaydedildi.");
                    })}
                    {button("Profili katalogda yayınla", async () => {
                      setBusiness(
                        await api.request<Business>(
                          `/businesses/${business.id}`,
                          "PATCH",
                          { isPublic: true },
                        ),
                      );
                      setNotice(
                        "Profil kataloğa açıldı; verification durumu değişmedi.",
                      );
                    })}
                    <BusinessSetup
                      key={business.id}
                      api={api}
                      businessId={business.id}
                      busy={busy}
                      run={run}
                    />
                    {button("Gelir özetini yükle", async () => {
                      setRevenue(
                        await api.request(
                          `/businesses/${business.id}/financial/summary`,
                        ),
                      );
                    })}
                    {revenue && (
                      <Text>
                        {revenue.status === "AVAILABLE"
                          ? `Kayıtlı brüt: ${revenue.grossRevenueMinor} · Net: ${revenue.netRevenueMinor} ${revenue.currency} (minor units)`
                          : revenue.status === "INSUFFICIENT_DATA"
                            ? "Ledger kaydı yok; tahsil edilmiş gelir iddiası yok."
                            : "Para birimleri birlikte gösterilemiyor; FX doğrulaması gerekli."}
                      </Text>
                    )}
                  </>
                )}
              </View>
            )}
            <View style={styles.card}>
              <Text style={styles.heading}>
                {mode === "customer" ? "Randevularım" : "Beauty Jobs"}
              </Text>
              {button("Randevuları yenile", loadBookings)}
              {!bookings.length && (
                <Text style={styles.body}>Henüz yüklenmiş randevu yok.</Text>
              )}
              {mode === "business" && (
                <Text>
                  Yüklü bekleyen rezervasyon talepleri:{" "}
                  {bookings.filter((b) => b.status === "PENDING").length}. Bu
                  sayı yüklü kayıtlarla sınırlıdır; talep tahmini değildir.
                </Text>
              )}
              {bookings.map((b) =>
                button(
                  `${b.service.name} · ${new Date(b.startsAt).toLocaleString()} · ${b.status}`,
                  async () => {
                    setSelected(b);
                    setResult(null);
                    const r = await api.request<{ result: MvpResult | null }>(
                      `/mvp/v1/businesses/${b.businessId}/appointments/${b.id}/result`,
                    );
                    setResult(r.result);
                    if (!r.result) setNotice("Sonuç henüz kaydedilmedi.");
                  },
                ),
              )}
            </View>
            {selected && (
              <View style={styles.card}>
                <Text style={styles.heading}>
                  {selected.service.name} · {selected.status}
                </Text>
                {mode === "business" && (
                  <>
                    {[
                      "CONFIRMED",
                      "CHECKED_IN",
                      "IN_PROGRESS",
                      "COMPLETED",
                      "CANCELLED",
                      "NO_SHOW",
                    ].map((status) =>
                      button(`Durum: ${status}`, async () => {
                        await api.request(
                          `/businesses/${selected.businessId}/appointments/${selected.id}/status`,
                          "PATCH",
                          { status },
                        );
                        setSelected({ ...selected, status });
                        await loadBookings();
                      }),
                    )}
                    {selected.status === "COMPLETED" && !result && (
                      <>
                        {input("Yapılan işlemin sonucu", summary, setSummary)}
                        {button("Sonucu kaydet", async () => {
                          setResult(
                            await api.request<MvpResult>(
                              `${resultPath}/result`,
                              "POST",
                              {
                                summary,
                                idempotencyKey: key(`${resultPath}:${summary}`),
                              },
                            ),
                          );
                          setNotice("Sonuç kaydedildi.");
                        })}
                      </>
                    )}
                  </>
                )}
                {result && (
                  <>
                    <Text style={styles.body}>{result.summary}</Text>
                    <Text>
                      Memnuniyet:{" "}
                      {result.satisfaction?.outcome ?? "Henüz bildirilmedi"}
                    </Text>
                    {mode === "customer" &&
                      !result.satisfaction &&
                      (
                        [
                          ["SATISFIED", "Memnunum"],
                          ["UNSATISFIED", "Memnun değilim"],
                          ["UNSURE", "Emin değilim"],
                        ] as const
                      ).map(([outcome, label]) =>
                        button(label, async () => {
                          await api.request(
                            `${resultPath}/satisfaction`,
                            "POST",
                            {
                              outcome,
                              idempotencyKey: key(`${resultPath}:${outcome}`),
                            },
                          );
                          setResult({ ...result, satisfaction: { outcome } });
                        }),
                      )}
                  </>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8f4ef" },
  content: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 80,
    maxWidth: 780,
    width: "100%",
    alignSelf: "center",
    gap: 18,
  },
  eyebrow: {
    color: "#8b4b39",
    fontWeight: "700",
    letterSpacing: 2,
    fontSize: 11,
  },
  title: { color: "#23382f", fontSize: 38, fontWeight: "700" },
  heading: {
    color: "#23382f",
    fontSize: 21,
    fontWeight: "600",
    marginBottom: 10,
  },
  body: { color: "#58645c", lineHeight: 24, fontSize: 15 },
  small: { color: "#68776e", fontSize: 11, lineHeight: 20 },
  notice: {
    color: "#7c4127",
    backgroundColor: "#f3e8db",
    padding: 14,
    lineHeight: 22,
  },
  card: {
    padding: 22,
    backgroundColor: "#fffdf9",
    borderRadius: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e8e2d7",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d4dcd4",
    borderRadius: 10,
    padding: 14,
    color: "#23382f",
    backgroundColor: "#fff",
    minHeight: 48,
  },
  button: {
    backgroundColor: "#264e3d",
    borderRadius: 10,
    padding: 14,
    marginVertical: 3,
  },
  buttonText: { color: "white", fontSize: 14, fontWeight: "600" },
});
