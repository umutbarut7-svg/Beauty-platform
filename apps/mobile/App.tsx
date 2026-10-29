import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  ApiError,
  MvpApiClient,
  type DiscoverySearchResponse,
  type MvpBooking,
  type MvpCatalog,
  type MvpResult,
} from "@beauty-platform/types";
import {
  hasUnknownStaffLocations,
  locationLabel,
  staffForBooking,
} from "./booking-options";
import { KeyboardScreen } from "./KeyboardScreen";
import { OrzellBrand } from "./OrzellBrand";
import { BusinessSetup } from "./BusinessSetup";
import { BusinessDemand } from "./BusinessDemand";
import { VisualJourney } from "./VisualJourney";
import { BusinessIntelligenceSetup } from "./BusinessIntelligenceSetup";
import {
  AppText as Text,
  palette,
  todayIso,
  bookingDateError,
  statusLabels,
  outcomeLabels,
  formatPrice,
  formatMinorUnits,
} from "./ui";

const api = new MvpApiClient(
  process.env.EXPO_PUBLIC_API_URL ??
    "https://preview.13-51-112-228.sslip.io/api",
);
type Business = {
  id: string;
  name: string;
  isVerified: boolean;
  description?: string;
};
type Slot = { startsAt: string; staffId: string };
type Screen =
  | "discover"
  | "consultation"
  | "bookings"
  | "passport"
  | "account"
  | "workspace"
  | "setup"
  | "insights";
const transitions: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
};
const actionLabels: Record<string, string> = {
  CONFIRMED: "Randevuyu onayla",
  CHECKED_IN: "Müşteri geldi",
  IN_PROGRESS: "İşlemi başlat",
  COMPLETED: "İşlemi tamamla",
  CANCELLED: "Randevuyu iptal et",
  NO_SHOW: "Katılım olmadı olarak işaretle",
};
function businessLabel(b: Business, values: Business[], selectedId?: string) {
  const duplicates = values.filter(
    (item) =>
      item.name.trim().toLocaleLowerCase("tr") ===
      b.name.trim().toLocaleLowerCase("tr"),
  );
  let suffix = "";
  if (duplicates.length > 1) {
    let length = 6;
    while (
      length < b.id.length &&
      duplicates.some(
        (item) =>
          item.id !== b.id && item.id.slice(-length) === b.id.slice(-length),
      )
    )
      length++;
    suffix = ` · ${b.id.slice(-length)}`;
  }
  return `${b.name}${suffix}${selectedId === b.id ? " · Seçili ✓" : ""}`;
}
const dateLabel = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function App() {
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [mode, setMode] = useState<"customer" | "business">("customer");
  const [screen, setScreen] = useState<Screen>("discover");
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [intent, setIntent] = useState("");
  const [target, setTarget] = useState("");
  const [matches, setMatches] = useState<DiscoverySearchResponse["items"]>([]);
  const [searched, setSearched] = useState(false);
  const [catalog, setCatalog] = useState<MvpCatalog | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [bookings, setBookings] = useState<MvpBooking[]>([]);
  const [selected, setSelected] = useState<MvpBooking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [result, setResult] = useState<MvpResult | null>(null);
  const [resultRead, setResultRead] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [passport, setPassport] = useState<MvpResult[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [creatingBusiness, setCreatingBusiness] = useState(false);
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
    setScreen("discover");
    setName("");
    setCreatingBusiness(false);
    setServiceId("");
    setLocationId("");
    setStaffId("");
    setAvailabilityNotice("");
    setSlots([]);
    setPendingSlot(null);
    setDate(todayIso());
    setMatches([]);
    setSearched(false);
    setCatalog(null);
    setBookings([]);
    setSelected(null);
    setResult(null);
    setResultRead("idle");
    setPassport([]);
    setBusinesses([]);
    setBusiness(null);
    setRevenue(null);
    setIntent("");
    setTarget("");
    setSummary("");
    setCancelTarget(null);
    keys.current.clear();
  };
  function report(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      setUser(null);
      reset();
    }
    setNotice(
      error instanceof ApiError
        ? error.message
        : "Bağlantı kurulamadı. Yeniden deneyin.",
    );
  }
  async function run(action: () => Promise<void>) {
    // Lock synchronously: a second press can arrive before busy renders.
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      report(error);
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }
  // Each screen owns its read request. Cleanup prevents a late response from another account/business restoring stale data.
  useEffect(() => {
    if (!user) return;
    let current = true;
    const load = async () => {
      if (!["bookings", "passport", "workspace", "insights"].includes(screen))
        return;
      setLoading(true);
      try {
        if (screen === "bookings") {
          setBookings([]);
          const items =
            mode === "customer"
              ? (await api.request<{ items: MvpBooking[] }>("/mvp/v1/bookings"))
                  .items
              : business
                ? await api.request<MvpBooking[]>(
                    `/businesses/${business.id}/appointments`,
                  )
                : [];
          if (current) setBookings(items);
        } else if (screen === "passport" && mode === "customer") {
          setPassport([]);
          const value = await api.request<{ items: MvpResult[] }>(
            "/mvp/v1/passport",
          );
          if (current) setPassport(value.items);
        } else if (screen === "workspace" && mode === "business") {
          const values = await api.request<Business[]>("/businesses");
          if (current) {
            setBusinesses(values);
            if (!business && values.length === 1 && values[0]) {
              setBusiness(values[0]);
              setName(values[0].name);
            }
          }
        } else if (screen === "insights" && mode === "business" && business) {
          setRevenue(null);
          const value = await api.request<typeof revenue>(
            `/businesses/${business.id}/financial/summary`,
          );
          if (current) setRevenue(value);
        }
      } catch (error) {
        if (current) report(error);
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => {
      current = false;
      setLoading(false);
    };
    // Identity and workspace determine ownership; input edits never repeat a read.
  }, [user?.id, mode, screen, business?.id, refresh]);
  function navigate(next: Screen) {
    if (busy) return;
    setNotice("");
    setSelected(null);
    setResult(null);
    setResultRead("idle");
    setSummary("");
    setCancelTarget(null);
    setScreen(next);
  }
  const key = (operation: string) => {
    let value = keys.current.get(operation);
    if (!value) {
      value = `mvp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      keys.current.set(operation, value);
    }
    return value;
  };
  const button = (
    label: string,
    action: () => Promise<void>,
    secondary = false,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        busy && styles.disabled,
      ]}
      onPress={() => void run(action)}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
        {label}
      </Text>
    </Pressable>
  );
  const input = (
    label: string,
    value: string,
    change: (value: string) => void,
    secure = false,
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={palette.muted}
      value={value}
      onChangeText={change}
      secureTextEntry={secure}
      autoCapitalize="none"
      editable={!busy}
      style={styles.input}
      maxLength={secure ? 128 : 2000}
    />
  );
  async function authenticate(action: "login" | "register") {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNotice("Geçerli bir e-posta adresi girin.");
      return;
    }
    if (!password || (action === "register" && password.length < 12)) {
      setNotice(
        action === "register"
          ? "Hesap oluşturmak için şifreniz en az 12 karakter olmalı."
          : "Şifrenizi girin.",
      );
      return;
    }
    reset();
    try {
      const value = await api.signIn(action, normalizedEmail, password);
      setPassword("");
      setUser(value);
    } catch (error) {
      if (
        error instanceof ApiError &&
        [400, 401, 409, 429].includes(error.status)
      ) {
        setNotice(
          error.status === 401
            ? "E-posta veya şifre hatalı. Bilgilerinizi kontrol edin."
            : error.status === 409
              ? "Bu e-posta zaten kayıtlı. Giriş yap seçeneğini kullanın."
              : error.status === 429
                ? "Çok fazla deneme yapıldı. Bir dakika sonra yeniden deneyin."
                : "Bilgileri kontrol edin. Yeni hesap için şifre en az 12 karakter olmalı.",
        );
        return;
      }
      throw error;
    }
  }
  async function search() {
    setCatalog(null);
    setMatches([]);
    setSearched(false);
    const response = await api.request<DiscoverySearchResponse>(
      `/discovery/search?query=${encodeURIComponent(intent.trim())}&limit=20`,
    );
    setMatches(response.items);
    setSearched(true);
  }
  async function choose(b: Business) {
    setCatalog(null);
    setAvailabilityNotice("");
    setSlots([]);
    setPendingSlot(null);
    setServiceId("");
    setStaffId("");
    setLocationId("");
    const value = await api.request<MvpCatalog>(`/mvp/v1/catalog/${b.id}`);
    setCatalog(value);
    setScreen("discover");
    if (value.locations.length === 1 && value.locations[0])
      setLocationId(value.locations[0].id);
  }
  async function loadBookings() {
    const items =
      mode === "customer"
        ? (await api.request<{ items: MvpBooking[] }>("/mvp/v1/bookings")).items
        : business
          ? await api.request<MvpBooking[]>(
              `/businesses/${business.id}/appointments`,
            )
          : [];
    setBookings(items);
  }
  async function loadResult(item: MvpBooking) {
    setCancelTarget(null);
    setSelected(item);
    setSummary("");
    setResult(null);
    setResultRead("loading");
    try {
      const value = await api.request<{ result: MvpResult | null }>(
        `/mvp/v1/businesses/${item.businessId}/appointments/${item.id}/result`,
      );
      setResult(value.result);
      setResultRead("ready");
    } catch (error) {
      setResultRead("error");
      throw error;
    }
  }
  async function cancelSelectedAppointment() {
    if (
      mode !== "customer" ||
      !selected ||
      cancelTarget !== selected.id ||
      !["PENDING", "CONFIRMED", "CHECKED_IN"].includes(selected.status) ||
      Date.parse(selected.startsAt) <= Date.now()
    )
      return;
    const cancelled = await api.request<MvpBooking>(
      `/businesses/${selected.businessId}/appointments/${selected.id}/cancel`,
      "POST",
      { reason: "Müşteri tarafından iptal edildi." },
    );
    if (cancelled.id !== selected.id || cancelled.status !== "CANCELLED")
      throw new Error("Unexpected cancellation response");
    setSelected(cancelled);
    setBookings((values) =>
      values.map((item) => (item.id === cancelled.id ? cancelled : item)),
    );
    setCancelTarget(null);
    setAvailabilityNotice("");
    setSlots([]);
    setPendingSlot(null);
    setNotice("Randevunuz iptal edildi.");
  }
  async function changeStatus(status: string) {
    if (
      !selected ||
      mode !== "business" ||
      !transitions[selected.status]?.includes(status)
    )
      return;
    await api.request(
      `/businesses/${selected.businessId}/appointments/${selected.id}/status`,
      "PATCH",
      { status },
    );
    setSelected({ ...selected, status });
    setCancelTarget(null);
    await loadBookings();
  }
  const selectedService = catalog?.services.find(
    (service) => service.id === serviceId,
  );
  const resultPath = selected
    ? `/mvp/v1/businesses/${selected.businessId}/appointments/${selected.id}`
    : "";
  const tabs: Array<{ screen: Screen; label: string; mark: string }> =
    mode === "customer"
      ? [
          { screen: "discover", label: "Keşfet", mark: "◇" },
          { screen: "bookings", label: "Randevular", mark: "▤" },
          { screen: "passport", label: "Bakımım", mark: "✧" },
          { screen: "account", label: "Hesabım", mark: "○" },
        ]
      : [
          { screen: "workspace", label: "İşletmem", mark: "◇" },
          { screen: "bookings", label: "Randevular", mark: "▤" },
          { screen: "insights", label: "Özet", mark: "▥" },
          { screen: "account", label: "Hesabım", mark: "○" },
        ];
  const activeTab =
    screen === "consultation"
      ? "discover"
      : screen === "setup"
        ? "workspace"
        : screen;
  return (
    <KeyboardScreen>
      <StatusBar
        barStyle="light-content"
        backgroundColor={palette.background}
      />
      {user && (
        <View style={styles.header}>
          <OrzellBrand compact />
          <Text style={styles.beta}>ERKEN ERİŞİM</Text>
        </View>
      )}
      <ScrollView
        key={user ? `${mode}-${screen}` : "auth"}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {!user ? (
          <>
            <OrzellBrand />
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>SANA AİT BİR BAKIM YOLCULUĞU</Text>
              <Text style={styles.title}>İyi hissetmenin{"\n"}yeni yolu.</Text>
              <Text style={styles.body}>
                Salonunu bul. Randevunu planla. Bakım geçmişini tek yerden takip
                et.
              </Text>
            </View>
            <View style={styles.card}>
              <View style={styles.segmented}>
                {(
                  [
                    ["login", "Giriş yap"],
                    ["register", "Hesap oluştur"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} ekranı`}
                    accessibilityState={{ selected: authMode === value }}
                    disabled={busy}
                    onPress={() => {
                      setAuthMode(value);
                      setNotice("");
                    }}
                    style={[
                      styles.segment,
                      authMode === value && styles.segmentActive,
                    ]}
                  >
                    <Text
                      style={
                        authMode === value
                          ? styles.segmentTextActive
                          : styles.small
                      }
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.heading}>
                {authMode === "login"
                  ? "Yeniden merhaba"
                  : "ORZELL'e hoş geldin"}
              </Text>
              <Text style={styles.body}>
                {authMode === "login"
                  ? "Bakım yolculuğuna kaldığın yerden devam et."
                  : "Kendi bakım yolculuğunu oluşturmaya başla."}
              </Text>
              <Text style={styles.fieldLabel}>E-posta</Text>
              <TextInput
                accessibilityLabel="E-posta"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                editable={!busy}
                placeholder="E-posta adresin"
                placeholderTextColor={palette.muted}
                style={styles.input}
                maxLength={254}
              />
              <Text style={styles.fieldLabel}>Parola</Text>
              {input("Parola", password, setPassword, true)}
              {authMode === "register" && (
                <Text style={styles.small}>
                  Güçlü bir parola seç: en az 12 karakter.
                </Text>
              )}
              {notice ? (
                <Text accessibilityRole="alert" style={styles.notice}>
                  {notice}
                </Text>
              ) : null}
              {button(
                authMode === "login" ? "Giriş yap" : "Hesap oluştur",
                () => authenticate(authMode),
              )}
              {busy && (
                <ActivityIndicator
                  color={palette.lavender}
                  accessibilityLabel="Giriş yapılıyor"
                />
              )}
            </View>
            <Text style={styles.footerNote}>
              Güzelliğin, bakımın ve sana iyi gelen deneyimlerin buluştuğu yer.
            </Text>
          </>
        ) : (
          <>
            {(busy || loading) && (
              <ActivityIndicator
                color={palette.lavender}
                accessibilityLabel="Yükleniyor"
              />
            )}
            {notice ? (
              <Text accessibilityRole="alert" style={styles.notice}>
                {notice}
              </Text>
            ) : null}
            {mode === "customer" && screen === "discover" && (
              <>
                {!catalog ? (
                  <>
                    <View style={styles.hero}>
                      <Text style={styles.eyebrow}>KENDİNE ZAMAN AYIR</Text>
                      <Text style={styles.title}>Sana iyi geleni keşfet.</Text>
                      <Text style={styles.body}>
                        İşletmeleri incele, hizmetini seç ve sana uygun saati
                        bul.
                      </Text>
                    </View>
                    <View style={styles.searchCard}>
                      <TextInput
                        accessibilityLabel="Hizmet veya işletme ara"
                        placeholder="Hizmet veya işletme ara"
                        placeholderTextColor={palette.muted}
                        value={intent}
                        onChangeText={setIntent}
                        editable={!busy}
                        style={styles.searchInput}
                        maxLength={120}
                        returnKeyType="search"
                        onSubmitEditing={() => void run(search)}
                      />
                      {button("Ara", search)}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Fotoğraflı danışmanlık"
                      disabled={busy}
                      onPress={() => navigate("consultation")}
                      style={styles.featureCard}
                    >
                      <Text style={styles.featureMark}>✧</Text>
                      <View style={styles.grow}>
                        <Text style={styles.heading}>
                          Görünümüne birlikte bakalım
                        </Text>
                        <Text style={styles.body}>
                          Fotoğraflı danışmanlık ve sana uygun hizmetler.
                        </Text>
                      </View>
                      <Text style={styles.arrow}>›</Text>
                    </Pressable>
                    <Text style={styles.heading}>
                      {searched ? "Arama sonuçları" : "İlk adım senin"}
                    </Text>
                    {!searched && (
                      <View style={styles.empty}>
                        <Text style={styles.emptyMark}>◇</Text>
                        <Text style={styles.heading}>
                          Yeni bir görünüm, doğru bir başlangıç
                        </Text>
                        <Text style={styles.body}>
                          Bir hizmet ya da işletme adıyla aramaya başla.
                        </Text>
                      </View>
                    )}
                    {searched && !matches.length && (
                      <View style={styles.empty}>
                        <Text style={styles.heading}>
                          Henüz sonuç bulamadık
                        </Text>
                        <Text style={styles.body}>
                          Başka bir hizmet veya işletme adı deneyebilirsin.
                        </Text>
                      </View>
                    )}
                    {matches.map((item) => (
                      <View key={item.businessId} style={styles.card}>
                        <View style={styles.row}>
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                              {item.name
                                .trim()
                                .slice(0, 2)
                                .toLocaleUpperCase("tr")}
                            </Text>
                          </View>
                          <View style={styles.grow}>
                            <Text style={styles.heading}>{item.name}</Text>
                            <Text style={styles.small}>
                              {item.city ?? "Konum belirtilmemiş"}
                            </Text>
                            {item.verified && (
                              <Text style={styles.badge}>
                                Doğrulanmış işletme
                              </Text>
                            )}
                          </View>
                        </View>
                        {button(`${item.name} hizmetlerini gör`, () =>
                          choose({
                            id: item.businessId,
                            name: item.name,
                            isVerified: item.verified,
                          }),
                        )}
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    {button(
                      "Aramaya dön",
                      async () => {
                        setCatalog(null);
                        setPendingSlot(null);
                        setAvailabilityNotice("");
                        setSlots([]);
                      },
                      true,
                    )}
                    <View style={styles.hero}>
                      <Text style={styles.eyebrow}>RANDEVUNU PLANLA</Text>
                      <Text style={styles.title}>{catalog.name}</Text>
                      <Text style={styles.body}>
                        Hizmetini ve sana uygun zamanı seç.
                      </Text>
                    </View>
                    <View style={styles.card}>
                      <Text style={styles.step}>01 · HİZMETİN</Text>
                      {!catalog.services.length && (
                        <Text style={styles.body}>
                          Bu işletmenin henüz rezervasyona açık hizmeti yok.
                        </Text>
                      )}
                      {catalog.services.map((service) => (
                        <Pressable
                          key={service.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${service.name} hizmetini seç`}
                          accessibilityState={{
                            selected: serviceId === service.id,
                          }}
                          disabled={busy}
                          onPress={() => {
                            setServiceId(service.id);
                            setStaffId("");
                            setAvailabilityNotice("");
                            setSlots([]);
                            setPendingSlot(null);
                          }}
                          style={[
                            styles.choice,
                            serviceId === service.id && styles.choiceSelected,
                          ]}
                        >
                          <View style={styles.grow}>
                            <Text style={styles.fieldLabel}>
                              {service.name}
                            </Text>
                            <Text style={styles.small}>
                              {service.durationMinutes} dakika
                            </Text>
                          </View>
                          <Text style={styles.price}>
                            {formatPrice(service.price, service.currency)}{" "}
                            {serviceId === service.id ? "✓" : ""}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {serviceId && (
                      <View style={styles.card}>
                        <Text style={styles.step}>
                          02 · YERİN VE PROFESYONELİN
                        </Text>
                        {catalog.locations.map((location) =>
                          button(
                            `${locationLabel(location, catalog.locations)}${locationId === location.id ? " ✓" : ""}`,
                            async () => {
                              setLocationId(location.id);
                              setStaffId("");
                              setAvailabilityNotice("");
                              setSlots([]);
                              setPendingSlot(null);
                            },
                            locationId !== location.id,
                          ),
                        )}
                        <Text style={styles.fieldLabel}>Profesyonel</Text>
                        {!locationId && (
                          <Text style={styles.small}>Önce şubeni seç.</Text>
                        )}
                        {locationId &&
                          !staffForBooking(catalog, serviceId, locationId)
                            .length &&
                          (hasUnknownStaffLocations(catalog, serviceId) ? (
                            <>
                              <Text style={styles.body}>
                                Bu şube için profesyonel bilgileri
                                doğrulanamadı. Bilgileri yenileyip yeniden seçim
                                yapabilirsin.
                              </Text>
                              {button(
                                "Hizmet ve şube bilgilerini yenile",
                                async () => choose(catalog),
                              )}
                            </>
                          ) : (
                            <Text style={styles.body}>
                              Bu şubede seçtiğin hizmet için rezervasyona açık
                              profesyonel yok. Başka bir şube seçebilirsin.
                            </Text>
                          ))}
                        {locationId &&
                          staffForBooking(catalog, serviceId, locationId).map(
                            (staff) =>
                              button(
                                `${staff.displayName}${staffId === staff.id ? " ✓" : ""}`,
                                async () => {
                                  setStaffId(staff.id);
                                  setAvailabilityNotice("");
                                  setSlots([]);
                                  setPendingSlot(null);
                                },
                                staffId !== staff.id,
                              ),
                          )}
                      </View>
                    )}
                    {serviceId &&
                      locationId &&
                      staffForBooking(catalog, serviceId, locationId).length >
                        0 && (
                        <View style={styles.card}>
                          <Text style={styles.step}>03 · ZAMANIN</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.dateRow}
                          >
                            {Array.from({ length: 7 }, (_, index) =>
                              todayIso(index),
                            ).map((value) => (
                              <Pressable
                                key={value}
                                accessibilityRole="button"
                                accessibilityLabel={`Tarih seç: ${value}`}
                                accessibilityState={{
                                  selected: date === value,
                                }}
                                disabled={busy}
                                onPress={() => {
                                  setDate(value);
                                  setAvailabilityNotice("");
                                  setSlots([]);
                                  setPendingSlot(null);
                                }}
                                style={[
                                  styles.dateChip,
                                  date === value && styles.choiceSelected,
                                ]}
                              >
                                <Text style={styles.fieldLabel}>
                                  {new Date(
                                    `${value}T12:00:00`,
                                  ).toLocaleDateString("tr-TR", {
                                    day: "numeric",
                                    month: "short",
                                  })}
                                </Text>
                                <Text style={styles.small}>
                                  {new Date(
                                    `${value}T12:00:00`,
                                  ).toLocaleDateString("tr-TR", {
                                    weekday: "short",
                                  })}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                          {input("Başka tarih (YYYY-MM-DD)", date, (value) => {
                            setDate(value);
                            setAvailabilityNotice("");
                            setSlots([]);
                            setPendingSlot(null);
                          })}
                          {button("Müsait saatleri bul", async () => {
                            setAvailabilityNotice("");
                            setSlots([]);
                            setPendingSlot(null);
                            const dateError = bookingDateError(date);
                            if (dateError) {
                              setAvailabilityNotice(dateError);
                              setNotice(dateError);
                              return;
                            }
                            const query = new URLSearchParams({
                              locationId,
                              serviceId,
                              date,
                              ...(staffId ? { staffMemberId: staffId } : {}),
                            });
                            try {
                              const value = await api.request<Slot[]>(
                                `/businesses/${catalog.id}/availability?${query}`,
                              );
                              setSlots(value);
                              if (!value.length)
                                setAvailabilityNotice(
                                  "Bu tarih için müsait saat bulunamadı. Başka bir gün veya şube seçebilirsin.",
                                );
                            } catch (error) {
                              setAvailabilityNotice(
                                error instanceof ApiError &&
                                  error.status === 404
                                  ? "Seçilen şube, hizmet ve profesyonel birlikte rezervasyona açık değil. Başka bir şube veya profesyonel seçebilirsin."
                                  : error instanceof ApiError
                                    ? error.message
                                    : "Müsait saatler yüklenemedi. Yeniden deneyebilirsin.",
                              );
                              throw error;
                            }
                          })}
                          {availabilityNotice ? (
                            <Text
                              accessibilityLiveRegion="polite"
                              style={styles.notice}
                            >
                              {availabilityNotice}
                            </Text>
                          ) : null}
                          <View style={styles.row}>
                            {slots.map((slot) => (
                              <Pressable
                                key={`${slot.startsAt}-${slot.staffId}`}
                                accessibilityRole="button"
                                accessibilityLabel={`Saat seç: ${new Date(slot.startsAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`}
                                accessibilityState={{
                                  selected: pendingSlot === slot,
                                }}
                                disabled={busy}
                                onPress={() => setPendingSlot(slot)}
                                style={[
                                  styles.timeChip,
                                  pendingSlot === slot && styles.choiceSelected,
                                ]}
                              >
                                <Text style={styles.fieldLabel}>
                                  {new Date(slot.startsAt).toLocaleTimeString(
                                    "tr-TR",
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}
                    {pendingSlot && selectedService && (
                      <View style={styles.confirmCard}>
                        <Text style={styles.eyebrow}>SON BİR KONTROL</Text>
                        <Text style={styles.heading}>Randevun hazır</Text>
                        <Text style={styles.body}>
                          {selectedService.name} · {catalog.name}
                        </Text>
                        <Text style={styles.body}>
                          {catalog.staff.find(
                            (staff) => staff.id === pendingSlot.staffId,
                          )?.displayName ??
                            "Profesyonel bilgisi işletme tarafından doğrulanır"}
                        </Text>
                        <Text style={styles.fieldLabel}>
                          {dateLabel(pendingSlot.startsAt)}
                        </Text>
                        <Text style={styles.price}>
                          {formatPrice(
                            selectedService.price,
                            selectedService.currency,
                          )}
                        </Text>
                        <Text style={styles.small}>
                          Onayladığında randevu talebin işletmeye iletilir. Bu
                          adımda ödeme alınmaz.
                        </Text>
                        {button("Randevuyu onayla", async () => {
                          const created = await api.request<MvpBooking>(
                            `/businesses/${catalog.id}/appointments`,
                            "POST",
                            {
                              locationId,
                              serviceId,
                              staffMemberId: pendingSlot.staffId,
                              bookForSelf: true,
                              startsAt: pendingSlot.startsAt,
                            },
                          );
                          setAvailabilityNotice("");
                          setSlots([]);
                          setPendingSlot(null);
                          setSelected(created);
                          setResult(null);
                          setResultRead("idle");
                          setSummary("");
                          setScreen("bookings");
                          setNotice(
                            "Randevun kaydedildi. İşletmenin yanıtını Randevular ekranından takip edebilirsin.",
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </>
            )}
            {mode === "customer" && screen === "consultation" && (
              <>
                {button(
                  "Keşfete dön",
                  async () => {
                    setScreen("discover");
                  },
                  true,
                )}
                <View style={styles.hero}>
                  <Text style={styles.eyebrow}>SANA ÖZEL DANIŞMANLIK</Text>
                  <Text style={styles.title}>Aklındaki görünüm.</Text>
                  <Text style={styles.body}>
                    İsteğini ve hedefini paylaş. Fotoğrafın için izin her zaman
                    senin kontrolünde.
                  </Text>
                </View>
                <View style={styles.card}>
                  {input("İsteğiniz", intent, setIntent)}
                  {input("Hedefiniz", target, setTarget)}
                  <VisualJourney
                    key={user.id}
                    api={api}
                    intent={intent}
                    target={target}
                    busy={busy}
                    run={run}
                    report={report}
                    choose={choose}
                    restoreContext={(restoredIntent, restoredTarget) => {
                      setIntent(restoredIntent);
                      setTarget(restoredTarget);
                    }}
                  />
                </View>
              </>
            )}
            {mode === "customer" && screen === "passport" && (
              <>
                <View style={styles.hero}>
                  <Text style={styles.eyebrow}>SENİN BAKIM GEÇMİŞİN</Text>
                  <Text style={styles.title}>Bakımım</Text>
                  <Text style={styles.body}>
                    Tamamlanan deneyimlerin ve kaydedilmiş sonuçların burada.
                  </Text>
                </View>
                {button(
                  "Bakım geçmişimi yenile",
                  async () => {
                    setRefresh((value) => value + 1);
                  },
                  true,
                )}
                {!loading && !passport.length && (
                  <View style={styles.empty}>
                    <Text style={styles.emptyMark}>✧</Text>
                    <Text style={styles.heading}>Hikâyen burada birikecek</Text>
                    <Text style={styles.body}>
                      İşletmenin kaydettiği sonuç ve senin memnuniyet bildirimin
                      tamamlandığında bakım geçmişin güncellenir.
                    </Text>
                  </View>
                )}
                {passport.map((item) => (
                  <View key={item.id} style={styles.card}>
                    <Text style={styles.small}>
                      {new Date(item.createdAt).toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </Text>
                    <Text style={styles.heading}>{item.summary}</Text>
                    <Text style={styles.badge}>
                      Memnuniyet:{" "}
                      {item.satisfaction
                        ? (outcomeLabels[item.satisfaction.outcome] ??
                          "Bildirildi")
                        : "Henüz bildirilmedi"}
                    </Text>
                  </View>
                ))}
              </>
            )}
            {mode === "business" && screen === "workspace" && (
              <>
                <View style={styles.hero}>
                  <Text style={styles.eyebrow}>ORZELL İŞLETME</Text>
                  <Text style={styles.title}>İşletmene hoş geldin.</Text>
                  <Text style={styles.body}>
                    Ekibini, hizmetlerini ve randevularını tek yerden yönet.
                  </Text>
                </View>
                <View style={styles.card}>
                  <Text style={styles.heading}>İşletmeni seç</Text>
                  {businesses.map((item) =>
                    button(
                      businessLabel(item, businesses, business?.id),
                      async () => {
                        setBusiness(item);
                        setName(item.name);
                        setBookings([]);
                        setSelected(null);
                        setResult(null);
                        setResultRead("idle");
                        setSummary("");
                        setRevenue(null);
                      },
                      item.id !== business?.id,
                    ),
                  )}
                  {!loading && !businesses.length && (
                    <Text style={styles.body}>
                      Henüz bir işletmen yok. İlk işletmeni ekleyerek
                      başlayabilirsin.
                    </Text>
                  )}
                  {button(
                    "İşletmelerimi yenile",
                    async () => {
                      setRefresh((value) => value + 1);
                    },
                    true,
                  )}
                </View>
                {business && (
                  <View style={styles.featureCard}>
                    <View style={styles.grow}>
                      <Text style={styles.heading}>{business.name}</Text>
                      <Text style={styles.small}>
                        {business.isVerified
                          ? "Doğrulanmış işletme"
                          : "Doğrulama bekleniyor"}
                      </Text>
                      {button("İşletme ayarları", async () => {
                        setScreen("setup");
                      })}
                      {button(
                        "İşletme randevularını gör",
                        async () => {
                          setScreen("bookings");
                        },
                        true,
                      )}
                    </View>
                  </View>
                )}
                {button(
                  "Yeni işletme ekle",
                  async () => {
                    setCreatingBusiness(!creatingBusiness);
                    setName("");
                  },
                  true,
                )}
                {creatingBusiness && (
                  <View style={styles.card}>
                    {input("İşletme / profil adı", name, setName)}
                    {button("İşletme oluştur", async () => {
                      const value = await api.request<Business>(
                        "/businesses",
                        "POST",
                        { name },
                      );
                      setBusiness(value);
                      setBusinesses((values) => [...values, value]);
                      setName(value.name);
                      setCreatingBusiness(false);
                      setNotice(
                        "İşletmen kaydedildi. Hizmetlerini ve çalışma saatlerini ekleyebilirsin.",
                      );
                    })}
                  </View>
                )}
              </>
            )}
            {mode === "business" && screen === "setup" && business && (
              <>
                {button(
                  "İşletmeme dön",
                  async () => {
                    setScreen("workspace");
                  },
                  true,
                )}
                <Text style={styles.title}>{business.name}</Text>
                <View style={styles.card}>
                  <Text style={styles.heading}>Profil</Text>
                  {input("İşletme / profil adı", name, setName)}
                  {button("Profil adını kaydet", async () => {
                    const value = await api.request<Business>(
                      `/businesses/${business.id}`,
                      "PATCH",
                      { name },
                    );
                    setBusiness(value);
                    setBusinesses((values) =>
                      values.map((item) =>
                        item.id === value.id ? value : item,
                      ),
                    );
                    setNotice("Profil kaydedildi.");
                  })}
                  {button(
                    "Profili katalogda yayınla",
                    async () => {
                      setBusiness(
                        await api.request<Business>(
                          `/businesses/${business.id}`,
                          "PATCH",
                          { isPublic: true },
                        ),
                      );
                      setNotice(
                        "Profilin katalogda görünür oldu. İşletme doğrulaması ayrı olarak değerlendirilir.",
                      );
                    },
                    true,
                  )}
                </View>
                <View style={styles.card}>
                  <BusinessSetup
                    key={business.id}
                    api={api}
                    businessId={business.id}
                    busy={busy}
                    run={run}
                  />
                </View>
                <View style={styles.card}>
                  <BusinessIntelligenceSetup
                    key={business.id}
                    api={api}
                    businessId={business.id}
                    busy={busy}
                    run={run}
                  />
                </View>
              </>
            )}
            {mode === "business" && screen === "insights" && (
              <>
                <View style={styles.hero}>
                  <Text style={styles.eyebrow}>İŞLETMENİN NABZI</Text>
                  <Text style={styles.title}>Genel özet</Text>
                  <Text style={styles.body}>
                    {business?.name ??
                      "Önce İşletmem ekranından bir işletme seç."}
                  </Text>
                </View>
                {business && (
                  <>
                    <View style={styles.card}>
                      <Text style={styles.heading}>Gelir özeti</Text>
                      {revenue?.status === "AVAILABLE" ? (
                        <>
                          <Text style={styles.small}>Kayıtlı brüt gelir</Text>
                          <Text style={styles.amount}>
                            {formatMinorUnits(
                              revenue.grossRevenueMinor,
                              revenue.currency,
                            )}
                          </Text>
                          <Text style={styles.small}>
                            Net gelir ·{" "}
                            {formatMinorUnits(
                              revenue.netRevenueMinor,
                              revenue.currency,
                            )}
                          </Text>
                        </>
                      ) : (
                        !loading && (
                          <Text style={styles.body}>
                            {revenue?.status === "INSUFFICIENT_DATA"
                              ? "Henüz kayıtlı tahsilat yok."
                              : revenue
                                ? "Farklı para birimleri ayrı değerlendirilmelidir."
                                : "Gelir özeti yüklenemedi. Yeniden deneyebilirsin."}
                          </Text>
                        )
                      )}
                      {button(
                        "Gelir özetini yenile",
                        async () => {
                          setRefresh((value) => value + 1);
                        },
                        true,
                      )}
                    </View>
                    <View style={styles.card}>
                      <BusinessDemand
                        key={business.id}
                        api={api}
                        businessId={business.id}
                        busy={busy}
                        run={run}
                      />
                    </View>
                  </>
                )}
              </>
            )}
            {screen === "bookings" && (
              <>
                <View style={styles.hero}>
                  <Text style={styles.eyebrow}>
                    {mode === "customer"
                      ? "SANA AYRILAN ZAMAN"
                      : (business?.name ?? "ORZELL İŞLETME")}
                  </Text>
                  <Text style={styles.title}>
                    {mode === "customer" ? "Randevularım" : "Randevular"}
                  </Text>
                  <Text style={styles.body}>
                    {mode === "customer"
                      ? "Yaklaşan deneyimlerin ve randevu durumların."
                      : "Randevuları takip et, işlem ve sonuçlarını yönet."}
                  </Text>
                </View>
                {button("Randevuları yenile", loadBookings, true)}
                {mode === "business" && !business && (
                  <Text style={styles.notice}>
                    İşletmem ekranından bir işletme seç.
                  </Text>
                )}
                {!loading && !bookings.length && (
                  <View style={styles.empty}>
                    <Text style={styles.emptyMark}>▤</Text>
                    <Text style={styles.heading}>Henüz randevu yok</Text>
                    <Text style={styles.body}>
                      {mode === "customer"
                        ? "Sana uygun bir hizmet seçerek ilk randevunu oluşturabilirsin."
                        : "Seçilen işletmenin randevuları burada görünecek."}
                    </Text>
                    {mode === "customer" &&
                      button("Hizmetleri keşfet", async () => {
                        setScreen("discover");
                      })}
                  </View>
                )}
                {bookings.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.service.name} · ${dateLabel(item.startsAt)} · ${statusLabels[item.status] ?? "Durum bilgisi alınamadı"}`}
                    disabled={busy}
                    style={[
                      styles.card,
                      selected?.id === item.id && styles.choiceSelected,
                    ]}
                    onPress={() => void run(() => loadResult(item))}
                  >
                    <Text style={styles.badge}>
                      {statusLabels[item.status] ?? "Durum bilgisi alınamadı"}
                    </Text>
                    <Text style={styles.heading}>{item.service.name}</Text>
                    <Text style={styles.body}>{dateLabel(item.startsAt)}</Text>
                    <Text style={styles.price}>
                      {formatPrice(item.price, item.currency)}
                    </Text>
                  </Pressable>
                ))}
                {selected && (
                  <View style={styles.card}>
                    <Text style={styles.step}>RANDEVU DETAYI</Text>
                    <Text style={styles.heading}>{selected.service.name}</Text>
                    <Text style={styles.body}>
                      {dateLabel(selected.startsAt)} ·{" "}
                      {statusLabels[selected.status]}
                    </Text>
                    {resultRead === "loading" && (
                      <Text style={styles.body}>Sonuç bilgisi yükleniyor.</Text>
                    )}
                    {resultRead === "error" && (
                      <>
                        <Text style={styles.body}>
                          Sonuç bilgisi yüklenemedi. Tekrar yükleyin.
                        </Text>
                        {button("Sonuç bilgisini yeniden yükle", () =>
                          loadResult(selected),
                        )}
                      </>
                    )}
                    {mode === "customer" &&
                      ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(
                        selected.status,
                      ) &&
                      Date.parse(selected.startsAt) > Date.now() &&
                      (cancelTarget === selected.id ? (
                        <>
                          <Text style={styles.body}>
                            Bu randevuyu iptal etmek istediğine emin misin?
                          </Text>
                          {button("İptali onayla", cancelSelectedAppointment)}
                          {button(
                            "Vazgeç",
                            async () => {
                              setCancelTarget(null);
                            },
                            true,
                          )}
                        </>
                      ) : (
                        button(
                          "Randevuyu iptal et",
                          async () => {
                            setCancelTarget(selected.id);
                          },
                          true,
                        )
                      ))}
                    {mode === "business" && (
                      <>
                        {(transitions[selected.status] ?? []).map((status) =>
                          status === "CANCELLED" ? (
                            cancelTarget === selected.id ? (
                              <View key={status}>
                                <Text style={styles.body}>
                                  Randevu iptal edilecek.
                                </Text>
                                {button("İptali onayla", () =>
                                  changeStatus("CANCELLED"),
                                )}
                                {button(
                                  "Vazgeç",
                                  async () => {
                                    setCancelTarget(null);
                                  },
                                  true,
                                )}
                              </View>
                            ) : (
                              button(
                                actionLabels[status] ?? "Durumu güncelle",
                                async () => {
                                  setCancelTarget(selected.id);
                                },
                                true,
                              )
                            )
                          ) : (
                            button(
                              actionLabels[status] ?? "Durumu güncelle",
                              () => changeStatus(status),
                              true,
                            )
                          ),
                        )}
                        {selected.status === "COMPLETED" &&
                          resultRead === "ready" &&
                          !result && (
                            <>
                              {input(
                                "Yapılan işlemin sonucu",
                                summary,
                                setSummary,
                              )}
                              {button("Sonucu kaydet", async () => {
                                if (resultRead !== "ready" || result) return;
                                if (!summary.trim() || summary.length > 2000) {
                                  setNotice(
                                    "Sonucu 1–2000 karakter arasında yazın.",
                                  );
                                  return;
                                }
                                setResult(
                                  await api.request<MvpResult>(
                                    `${resultPath}/result`,
                                    "POST",
                                    {
                                      summary,
                                      idempotencyKey: key(
                                        `${resultPath}:${summary}`,
                                      ),
                                    },
                                  ),
                                );
                                setSummary("");
                                setNotice("Sonuç kaydedildi.");
                              })}
                            </>
                          )}
                      </>
                    )}
                    {result && (
                      <>
                        <Text style={styles.step}>BAKIM SONUCUN</Text>
                        <Text style={styles.body}>{result.summary}</Text>
                        <Text style={styles.small}>
                          Memnuniyet:{" "}
                          {result.satisfaction
                            ? (outcomeLabels[result.satisfaction.outcome] ??
                              "Bildirildi")
                            : "Henüz bildirilmedi"}
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
                                  idempotencyKey: key(
                                    `${resultPath}:${outcome}`,
                                  ),
                                },
                              );
                              setResult({
                                ...result,
                                satisfaction: { outcome },
                              });
                            }),
                          )}
                      </>
                    )}
                  </View>
                )}
              </>
            )}
            {screen === "account" && (
              <>
                <View style={styles.hero}>
                  <Text style={styles.eyebrow}>ORZELL HESABIN</Text>
                  <Text style={styles.title}>Hesabım</Text>
                  <Text style={styles.body}>{email.trim().toLowerCase()}</Text>
                </View>
                <View style={styles.card}>
                  <Text style={styles.heading}>Kullanım alanın</Text>
                  <Text style={styles.body}>
                    {mode === "customer"
                      ? "Kişisel bakım ve randevu hesabındasın."
                      : "İşletme yönetim alanındasın."}
                  </Text>
                  {button(
                    mode === "customer"
                      ? "İşletme alanına geç"
                      : "Kişisel hesabıma geç",
                    async () => {
                      const next =
                        mode === "customer" ? "business" : "customer";
                      reset();
                      setMode(next);
                      setScreen(next === "business" ? "workspace" : "discover");
                    },
                  )}
                </View>
                {mode === "customer" && (
                  <View style={styles.card}>
                    <Text style={styles.heading}>Fotoğraf izinlerin</Text>
                    <Text style={styles.body}>
                      İzinlerini fotoğraflı danışmanlık bölümünden inceleyebilir
                      ve geri çekebilirsin.
                    </Text>
                    {button(
                      "Fotoğraf izinlerine git",
                      async () => {
                        setScreen("consultation");
                      },
                      true,
                    )}
                  </View>
                )}
                <View style={styles.card}>
                  <Text style={styles.heading}>ORZELL · Erken erişim</Text>
                  <Text style={styles.body}>
                    Hesabın kişiseldir. Ortak kullanılan cihazlardan ayrılırken
                    çıkış yap.
                  </Text>
                  {button(
                    "Çıkış yap",
                    async () => {
                      setUser(null);
                      reset();
                      await api.logout();
                    },
                    true,
                  )}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      {user && (
        <View style={styles.tabBar} accessibilityRole="tablist">
          {tabs.map((tab) => (
            <Pressable
              key={tab.screen}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{
                selected: activeTab === tab.screen,
                disabled: busy,
              }}
              disabled={busy}
              onPress={() => navigate(tab.screen)}
              style={[styles.tab, activeTab === tab.screen && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabMark,
                  activeTab === tab.screen && styles.activeTabText,
                ]}
              >
                {tab.mark}
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === tab.screen && styles.activeTabText,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  beta: { fontSize: 9, letterSpacing: 1.5, color: palette.muted },
  content: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 36,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
    gap: 20,
    flexGrow: 1,
  },
  hero: { gap: 12, paddingVertical: 8 },
  eyebrow: {
    color: palette.lavender,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "600",
  },
  title: {
    color: palette.text,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "600",
    letterSpacing: -1,
  },
  heading: {
    color: palette.text,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "600",
  },
  body: { color: palette.muted, fontSize: 14, lineHeight: 23 },
  small: { color: palette.muted, fontSize: 12, lineHeight: 20 },
  fieldLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 21,
  },
  footerNote: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  card: {
    padding: 20,
    backgroundColor: palette.surface,
    borderRadius: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  confirmCard: {
    padding: 22,
    backgroundColor: palette.raised,
    borderRadius: 22,
    gap: 16,
    borderWidth: 1,
    borderColor: palette.lavender,
  },
  featureCard: {
    backgroundColor: palette.raised,
    borderRadius: 22,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  featureMark: { color: palette.lavender, fontSize: 34 },
  arrow: { color: palette.lavender, fontSize: 28 },
  grow: { flex: 1, gap: 5, minWidth: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: palette.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: palette.lavender, fontSize: 17, fontWeight: "600" },
  input: {
    color: palette.text,
    backgroundColor: palette.field,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    minHeight: 52,
    fontSize: 15,
  },
  button: {
    backgroundColor: palette.primary,
    borderRadius: 14,
    padding: 16,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderColor: palette.border,
    borderWidth: 1,
  },
  secondaryText: { color: palette.lavender },
  disabled: { opacity: 0.5 },
  notice: {
    color: palette.text,
    backgroundColor: palette.raised,
    borderLeftWidth: 3,
    borderLeftColor: palette.lavender,
    borderRadius: 12,
    padding: 15,
    lineHeight: 22,
  },
  segmented: {
    backgroundColor: palette.field,
    borderRadius: 12,
    flexDirection: "row",
    padding: 4,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    padding: 8,
  },
  segmentActive: { backgroundColor: palette.raised },
  segmentTextActive: {
    color: palette.lavender,
    fontSize: 13,
    fontWeight: "600",
  },
  searchCard: { gap: 12 },
  searchInput: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    color: palette.text,
    borderColor: palette.border,
    borderWidth: 1,
    padding: 17,
    minHeight: 56,
    fontSize: 15,
  },
  empty: {
    padding: 24,
    backgroundColor: palette.surface,
    borderRadius: 22,
    gap: 12,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyMark: { color: palette.lavender, fontSize: 36, marginBottom: 8 },
  step: {
    color: palette.lavender,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
  },
  choice: {
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.field,
    borderWidth: 1,
    borderColor: palette.border,
  },
  choiceSelected: {
    borderColor: palette.lavender,
    backgroundColor: palette.raised,
  },
  price: { color: palette.lavender, fontSize: 17, fontWeight: "600" },
  badge: {
    color: palette.lavender,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 20,
  },
  dateRow: { gap: 8, paddingVertical: 4 },
  dateChip: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 12,
    gap: 3,
    minWidth: 78,
    alignItems: "center",
  },
  timeChip: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    minWidth: 76,
    padding: 13,
    alignItems: "center",
  },
  amount: { color: palette.lavender, fontSize: 32, fontWeight: "600" },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  tab: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 16,
    paddingHorizontal: 2,
  },
  activeTab: { backgroundColor: palette.raised },
  tabMark: { color: palette.muted, fontSize: 23, lineHeight: 27 },
  tabLabel: { color: palette.muted, fontSize: 10, fontWeight: "500" },
  activeTabText: { color: palette.lavender },
});
