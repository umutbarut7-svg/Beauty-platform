import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  ApiError,
  type AppointmentConsumption,
  type AppointmentConsumptionInput,
  type CatalogProduct,
  type MvpApiClient,
  type ProductPage,
} from "@beauty-platform/types";
import { AppText as Text, palette } from "./ui";
import { unitLabel } from "./ProductInventory";

type DraftLine = { product: CatalogProduct; quantity: string };
export function AppointmentMaterials({
  api,
  businessId,
  appointmentId,
  busy,
  run,
}: {
  api: MvpApiClient;
  businessId: string;
  appointmentId: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState(false);
  const [receipt, setReceipt] = useState<AppointmentConsumption | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [quantity, setQuantity] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState<AppointmentConsumptionInput | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const endpoint = `/businesses/${businessId}/appointments/${appointmentId}/materials`;
  const button = (label: string, action: () => Promise<void>) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={() => void run(action)}
      style={[styles.button, busy && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  async function read() {
    setLoaded(false);
    const result = await api.request<{
      consumption: AppointmentConsumption | null;
    }>(endpoint);
    setReceipt(result.consumption);
    setLoaded(true);
    if (result.consumption) {
      setPending(null);
      setLines([]);
      setReview(false);
      setMessage("Randevunun kayıtlı sarfı yüklendi.");
    } else if (pending)
      setMessage(
        "Henüz kayıt görünmüyor. Aynı listeyle yeniden kontrol edebilir veya tekrar gönderebilirsin.",
      );
  }
  async function loadProducts(more = false) {
    const result = await api.request<ProductPage<CatalogProduct>>(
      `/businesses/${businessId}/products${more && cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
    );
    setProducts((old) =>
      more
        ? [
            ...old,
            ...result.items.filter(
              (item) => !old.some((p) => p.id === item.id),
            ),
          ]
        : result.items,
    );
    setCursor(result.nextCursor);
    setSelected(null);
    setQuantity("");
  }
  async function submit(payload: AppointmentConsumptionInput) {
    setPending(payload);
    try {
      const result = await api.request<AppointmentConsumption>(
        endpoint,
        "POST",
        payload,
      );
      setReceipt(result);
      setPending(null);
      setLines([]);
      setReview(false);
      setReason("");
      setMessage(
        "Sarf kaydedildi ve tüm ürünlerin stoğu birlikte güncellendi.",
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        [400, 403, 404, 409].includes(error.status)
      ) {
        // A definite rejection permits editing only after a successful read
        // establishes that no earlier request already committed this receipt.
        const result = await api.request<{
          consumption: AppointmentConsumption | null;
        }>(endpoint);
        setReceipt(result.consumption);
        setPending(null);
        setReview(false);
        setMessage(
          result.consumption
            ? "Bu randevunun sarfı daha önce kaydedilmiş. Kayıtlı liste gösteriliyor."
            : "Sarf kaydedilmedi. Güncel stokları yükleyip ürün, miktar ve randevu durumunu kontrol et.",
        );
        return;
      }
      setMessage(
        "Kayıt sonucu doğrulanamadı. Liste korundu; kayıt durumunu kontrol et veya aynı listeyi tekrar gönder.",
      );
    }
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Randevuda kullanılan ürünler</Text>
      <Text style={styles.body}>
        Kullanılan sarfları birlikte kaydet. Stok yalnız son onayında düşer.
        Randevu başına tek liste kaydedilir.
      </Text>
      {!!message && (
        <Text accessibilityRole="alert" style={styles.body}>
          {message}
        </Text>
      )}
      {button("Randevu sarf kaydını yükle", read)}
      {loaded && receipt && (
        <View style={styles.card}>
          <Text style={styles.heading}>Kayıtlı sarf</Text>
          <Text style={styles.body}>
            {receipt.serviceName} ·{" "}
            {new Date(receipt.createdAt).toLocaleString("tr-TR")}
          </Text>
          {receipt.items.map((item) => (
            <Text key={item.productId} style={styles.body}>
              {item.productName} · {item.sku} · −{item.quantity}{" "}
              {unitLabel[item.unit]} · İşlem sonrası: {item.quantityAfter}
            </Text>
          ))}
          <Text style={styles.body}>{receipt.reason}</Text>
          <Text style={styles.body}>
            Bu liste yeniden stok düşürmez. Bir düzeltme gerekiyorsa ürünün stok
            hareketlerine açıklamalı giriş veya çıkış ekle.
          </Text>
        </View>
      )}
      {loaded && !receipt && pending && (
        <View style={styles.card}>
          <Text style={styles.body}>
            Sonuç doğrulanana kadar gönderilen liste korunur.
          </Text>
          {pending.items.map((item) => (
            <Text key={item.productId} style={styles.body}>
              {lines.find((line) => line.product.id === item.productId)?.product
                .name ?? item.productId}{" "}
              · {item.quantity}
            </Text>
          ))}
          {button("Aynı sarf listesini tekrar gönder", () => submit(pending))}
        </View>
      )}
      {loaded && !receipt && !pending && (
        <>
          {button("Sarf için güncel ürünleri yükle", () => loadProducts())}
          {!review && (
            <>
              {products
                .filter((product) => product.isActive)
                .map((product) => (
                  <Pressable
                    key={product.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${product.name} sarf olarak seç`}
                    aria-pressed={selected?.id === product.id}
                    disabled={busy}
                    style={[
                      styles.card,
                      selected?.id === product.id && styles.selected,
                    ]}
                    onPress={() => {
                      setSelected(product);
                      setQuantity("");
                    }}
                  >
                    <Text style={styles.body}>
                      {product.name} · {product.sku} · Stok:{" "}
                      {product.stockQuantity} {unitLabel[product.unit]}
                    </Text>
                  </Pressable>
                ))}
              {!!cursor &&
                button("Diğer sarf ürünlerini yükle", () => loadProducts(true))}
              {selected && (
                <>
                  <TextInput
                    accessibilityLabel="Kullanılan sarf miktarı"
                    placeholder={`Kullanılan miktar (${unitLabel[selected.unit]})`}
                    placeholderTextColor={palette.muted}
                    style={styles.input}
                    value={quantity}
                    editable={!busy}
                    maxLength={16}
                    onChangeText={setQuantity}
                  />
                  {button("Sarf listesine ekle", async () => {
                    const amount = quantity.trim().replace(",", ".");
                    if (
                      !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(amount) ||
                      Number(amount) <= 0 ||
                      (selected.unit === "UNIT" &&
                        !Number.isInteger(Number(amount))) ||
                      Number(amount) > Number(selected.stockQuantity)
                    ) {
                      setMessage(
                        "Stok miktarını aşmayan pozitif miktar gir. Adet için tam sayı kullan.",
                      );
                      return;
                    }
                    if (
                      lines.some((line) => line.product.id === selected.id) ||
                      lines.length >= 50
                    ) {
                      setMessage(
                        "Her ürünü bir kez ekle; en fazla 50 ürün seçebilirsin.",
                      );
                      return;
                    }
                    setLines((old) => [
                      ...old,
                      { product: selected, quantity: amount },
                    ]);
                    setSelected(null);
                    setQuantity("");
                    setMessage("");
                  })}
                </>
              )}
            </>
          )}
          {!!lines.length && (
            <View style={styles.card}>
              <Text style={styles.heading}>
                {lines.length} ürün sarf listesinde
              </Text>
              {lines.map((line) => (
                <View key={line.product.id} style={styles.line}>
                  <Text style={styles.body}>
                    {line.product.name} · {line.quantity}{" "}
                    {unitLabel[line.product.unit]}
                  </Text>
                  {!review &&
                    button(
                      `${line.product.name} sarf listesinden çıkar`,
                      async () =>
                        setLines((old) =>
                          old.filter(
                            (item) => item.product.id !== line.product.id,
                          ),
                        ),
                    )}
                </View>
              ))}
              <TextInput
                accessibilityLabel="Sarf kaydı açıklaması"
                placeholder="Sarf kaydı açıklaması"
                placeholderTextColor={palette.muted}
                style={styles.input}
                value={reason}
                editable={!busy && !review}
                maxLength={200}
                onChangeText={setReason}
              />
              {!review ? (
                button("Sarf listesini önizle", async () => {
                  if (!reason.trim()) {
                    setMessage("Kısa bir sarf açıklaması gir.");
                    return;
                  }
                  setReview(true);
                  setMessage("");
                })
              ) : (
                <>
                  <Text style={styles.body}>
                    Bu liste randevuya kalıcı olarak bağlanacak ve tüm miktarlar
                    birlikte stoktan düşecek.
                  </Text>
                  {button("Sarfı onayla ve stoktan düş", () =>
                    submit({
                      reason: reason.trim(),
                      items: lines.map((line) => ({
                        productId: line.product.id,
                        quantity: line.quantity,
                      })),
                    }),
                  )}
                  {button("Sarf listesini düzenle", async () =>
                    setReview(false),
                  )}
                </>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 12, marginTop: 16 },
  heading: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
  },
  body: { color: palette.muted, fontSize: 13, lineHeight: 22 },
  card: {
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    gap: 10,
    backgroundColor: palette.field,
  },
  selected: { borderColor: palette.lavender },
  line: { gap: 8 },
  button: {
    padding: 14,
    backgroundColor: palette.primary,
    borderRadius: 14,
    minHeight: 48,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 14, textAlign: "center" },
  input: {
    color: palette.text,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    minHeight: 50,
  },
  disabled: { opacity: 0.5 },
});
