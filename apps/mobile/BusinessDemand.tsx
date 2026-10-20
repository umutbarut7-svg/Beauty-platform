import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MvpApiClient } from "@beauty-platform/types";

const windows = [
  ["ROLLING_7_DAYS", "Son 7 gün"],
  ["ROLLING_30_DAYS", "Son 30 gün"],
  ["ROLLING_90_DAYS", "Son 90 gün"],
] as const;
type Window = (typeof windows)[number][0];
type Signal = {
  id: string;
  signalType: string;
  source: string;
  value: string;
  timeWindow: string;
  observedAt: string;
  dataState: string;
};
type Overview = {
  status: string;
  snapshot: null | {
    periodStart: string;
    periodEnd: string;
    observedAt: string;
  };
};
const signalNames: Record<string, string> = {
  SEARCH: "Arama",
  DISCOVERY_IMPRESSION: "Keşfet gösterimi",
  PROFILE_VIEW: "Profil görüntüleme",
  SERVICE_VIEW: "Hizmet görüntüleme",
  MATCH_REQUEST: "Eşleşme isteği",
  BOOKING_INTENT: "Randevu niyeti",
  BOOKING_ATTEMPT: "Randevu girişimi",
  COMPLETED_BOOKING: "Tamamlanan randevu",
  UNFULFILLED_DEMAND: "Karşılanamayan talep",
  NO_MATCH: "Eşleşme bulunamadı",
  AVAILABILITY_MISS: "Müsaitlik bulunamadı",
  REPEAT_DEMAND: "Tekrarlanan talep",
  PREDICTED_DEMAND: "Talep tahmini",
};
const states: Record<string, string> = {
  ZERO: "Kayıtlı değer sıfır",
  NO_DATA: "Veri yok",
  INSUFFICIENT_DATA: "Yeterli veri yok",
  AVAILABLE: "Veri mevcut",
  NO_MATCH: "Eşleşme yok",
  STALE_DATA: "Veri güncel değil",
  INVALID_SCOPE: "Kapsam geçersiz",
};
const sources: Record<string, string> = {
  OBSERVED: "Gözlem",
  DERIVED: "Türetilmiş veri",
  PREDICTED: "Tahmin; gerçekleşmiş talep değildir",
};
const timestamp = (value: string) => new Date(value).toLocaleString("tr-TR");

export function BusinessDemand({
  api,
  businessId,
  busy,
  run,
}: {
  api: MvpApiClient;
  businessId: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [window, setWindow] = useState<Window>("ROLLING_30_DAYS");
  const [data, setData] = useState<{
    overview: Overview;
    signals: Signal[];
  } | null>(null);
  const [failed, setFailed] = useState(false);
  async function load() {
    // Clear earlier results before a refresh, including when authorization fails.
    setData(null);
    setFailed(false);
    try {
      const path = `/businesses/${businessId}/marketplace`;
      const [overview, signals] = await Promise.all([
        api.request<Overview>(`${path}/liquidity?window=${window}`),
        api.request<Signal[]>(`${path}/demand?window=${window}&limit=20`),
      ]);
      setData({ overview, signals });
    } catch (error) {
      setFailed(true);
      throw error;
    }
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Talep görünümü</Text>
      <Text>
        Seçilen döneme ait son 20 kayıt gösterilir. Kayıtlar farklı olayları
        temsil edebilir; benzersiz müşteri veya toplam talep sayısı değildir.
      </Text>
      <View style={styles.row}>
        {windows.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Talep dönemi: ${label}`}
            accessibilityState={{ selected: window === value }}
            disabled={busy}
            style={styles.button}
            onPress={() => {
              setWindow(value);
              setData(null);
              setFailed(false);
            }}
          >
            <Text style={styles.white}>
              {label}
              {window === value ? " ✓" : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Talep verilerini yükle"
        disabled={busy}
        style={styles.button}
        onPress={() => void run(load)}
      >
        <Text style={styles.white}>Talep verilerini yükle</Text>
      </Pressable>
      {failed ? (
        <Text accessibilityRole="alert">
          Talep verileri yüklenemedi. Yetkinizi ve bağlantınızı kontrol edip
          yeniden deneyin.
        </Text>
      ) : !data ? (
        <Text>Seçilen dönem için talep verilerini yükleyin.</Text>
      ) : (
        <>
          <Text>
            Talep özeti:{" "}
            {states[data.overview.status] ?? "Durum değerlendirilemiyor"}
          </Text>
          {data.overview.snapshot && (
            <Text>
              Özet dönemi: {timestamp(data.overview.snapshot.periodStart)} –{" "}
              {timestamp(data.overview.snapshot.periodEnd)}. Son hesaplama:{" "}
              {timestamp(data.overview.snapshot.observedAt)}.
            </Text>
          )}
          {!data.signals.length ? (
            <Text>
              Bu dönem için kayıtlı talep sinyali yok. Bu, talebin sıfır olduğu
              anlamına gelmez.
            </Text>
          ) : (
            data.signals.map((signal) => (
              <View key={signal.id} style={styles.signal}>
                <Text>
                  {signalNames[signal.signalType] ?? "Talep kaydı"}:{" "}
                  {signal.value}
                </Text>
                <Text>
                  {sources[signal.source] ?? "Kaynak değerlendirilemiyor"}
                </Text>
                <Text>
                  {states[signal.dataState] ?? "Durum değerlendirilemiyor"}
                </Text>
                <Text>Kayıt zamanı: {timestamp(signal.observedAt)}</Text>
              </View>
            ))
          )}
          <Text>Tahminler randevu, müşteri veya gelir garantisi değildir.</Text>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 12, marginVertical: 16 },
  heading: { fontSize: 18, fontWeight: "600", color: "#23382f" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { padding: 12, backgroundColor: "#264e3d", borderRadius: 8 },
  white: { color: "white" },
  signal: { gap: 6, padding: 12, backgroundColor: "#f3eee6", borderRadius: 8 },
});
