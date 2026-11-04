import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type {
  CatalogProduct,
  MvpApiClient,
  ProductImportRow,
  ProductPage,
  StockMovement,
} from "@beauty-platform/types";
import { AppText as Text, formatPrice, palette } from "./ui";
import { parseProductRows } from "./product-import";
import { ApiError } from "@beauty-platform/types";
export const unitLabel = { UNIT: "adet", ML: "ml", G: "g" };

export function ProductInventory({
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
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState<ProductImportRow[]>([]);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [message, setMessage] = useState("");
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const keys = useRef(new Map<string, string>());
  const base = `/businesses/${businessId}/products`;
  const key = (payload: unknown) => {
    const text = JSON.stringify(payload);
    let value = keys.current.get(text);
    if (!value) {
      value = `inventory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      keys.current.set(text, value);
    }
    return value;
  };
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
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={palette.muted}
      style={styles.input}
      editable={!busy}
      value={value}
      onChangeText={change}
      maxLength={200}
    />
  );
  async function load(more = false) {
    const page = await api.request<ProductPage<CatalogProduct>>(
      `${base}${more && cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
    );
    const values = more
      ? [
          ...products,
          ...page.items.filter((p) => !products.some((old) => old.id === p.id)),
        ]
      : page.items;
    setProducts(values);
    setCursor(page.nextCursor);
    setLoaded(true);
    if (selected) {
      const current = values.find((p) => p.id === selected.id) ?? null;
      setSelected(current);
      if (current) {
        setEditName(current.name);
        setEditPrice(current.price);
        setEditThreshold(current.lowStockThreshold);
      }
      setHistory([]);
    }
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Ürünler ve stok</Text>
      <Text style={styles.body}>
        Ürünlerini toplu ekle; stok giriş ve çıkışlarını takip et.
      </Text>
      {!!message && (
        <Text accessibilityRole="alert" style={styles.body}>
          {message}
        </Text>
      )}
      {button("Ürün ve stok kayıtlarını yükle", async () => {
        await load();
        setMessage("Ürün kayıtları yüklendi.");
      })}
      {loaded && (
        <>
          {!products.length && (
            <Text style={styles.body}>Henüz ürün eklenmedi.</Text>
          )}
          {products.map((product) => (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              accessibilityLabel={`${product.name} ürününü yönet`}
              accessibilityState={{
                selected: selected?.id === product.id,
                disabled: busy,
              }}
              aria-pressed={selected?.id === product.id}
              disabled={busy}
              style={[
                styles.card,
                selected?.id === product.id && styles.selected,
              ]}
              onPress={() => {
                setSelected(product);
                setEditName(product.name);
                setEditPrice(product.price);
                setEditThreshold(product.lowStockThreshold);
                setQuantity("");
                setReason("");
                setHistory([]);
                setMessage("");
              }}
            >
              <Text style={styles.heading}>{product.name}</Text>
              <Text style={styles.body}>
                {product.brand ? `${product.brand} · ` : ""}
                {product.sku}
              </Text>
              <Text style={styles.price}>
                {formatPrice(product.price, product.currency)}
              </Text>
              <Text style={styles.body}>
                Stok: {product.stockQuantity} {unitLabel[product.unit]} · Uyarı
                eşiği: {product.lowStockThreshold}
              </Text>
              <Text style={styles.body}>
                {!product.isActive
                  ? "Pasif"
                  : Number(product.stockQuantity) === 0
                    ? "Stok tükendi"
                    : Number(product.stockQuantity) <=
                        Number(product.lowStockThreshold)
                      ? "Düşük stok"
                      : "Stok mevcut"}{" "}
                · {product.isPublic ? "Müşteriye açık" : "İşletmeye özel"}
              </Text>
            </Pressable>
          ))}
          {!!cursor && button("Diğer ürünleri yükle", () => load(true))}
          {selected && (
            <View style={styles.card}>
              <Text style={styles.heading}>Ürün bilgileri</Text>
              {field("Ürün adı", editName, setEditName)}
              {field("Ürün fiyatı", editPrice, setEditPrice)}
              {field("Düşük stok eşiği", editThreshold, setEditThreshold)}
              {button("Ürün bilgilerini kaydet", async () => {
                const price = editPrice.trim().replace(",", "."),
                  threshold = editThreshold.trim().replace(",", ".");
                if (
                  !editName.trim() ||
                  !/^\d{1,10}(?:\.\d{1,2})?$/.test(price) ||
                  !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(threshold)
                ) {
                  setMessage("Ürün adı, fiyat ve stok eşiğini kontrol et.");
                  return;
                }
                await api.request(`${base}/${selected.id}`, "PATCH", {
                  expectedRevision: selected.revision,
                  name: editName.trim(),
                  price,
                  lowStockThreshold: threshold,
                });
                setMessage("Ürün bilgileri kaydedildi.");
                await load();
              })}
              <Text style={styles.heading}>
                {selected.name} · Stok hareketi
              </Text>
              <View style={styles.row}>
                {button(
                  direction === "IN" ? "Giriş seçili" : "Stok girişi",
                  async () => setDirection("IN"),
                )}
                {button(
                  direction === "OUT" ? "Çıkış seçili" : "Stok çıkışı",
                  async () => setDirection("OUT"),
                )}
              </View>
              {field(
                `Miktar (${unitLabel[selected.unit]})`,
                quantity,
                setQuantity,
              )}
              {field("Stok hareketi açıklaması", reason, setReason)}
              {button("Stok hareketini kaydet", async () => {
                const amount = quantity.trim().replace(",", ".");
                if (
                  !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(amount) ||
                  Number(amount) <= 0 ||
                  (selected.unit === "UNIT" &&
                    !Number.isInteger(Number(amount))) ||
                  !reason.trim()
                ) {
                  setMessage(
                    "Pozitif miktar ve açıklama gir. Adet biriminde tam sayı kullan.",
                  );
                  return;
                }
                const payload = {
                  productId: selected.id,
                  quantity: amount,
                  direction,
                  reason: reason.trim(),
                };
                try {
                  await api.request(
                    `${base}/${selected.id}/movements`,
                    "POST",
                    {
                      quantity: amount,
                      direction,
                      reason: reason.trim(),
                      idempotencyKey: key(payload),
                    },
                  );
                } catch (error) {
                  if (error instanceof ApiError && error.status === 409) {
                    await load();
                    setMessage(
                      "Stok değişmiş veya çıkış miktarı yetersiz olabilir. Güncel stok miktarını kontrol et.",
                    );
                    return;
                  }
                  throw error;
                }
                keys.current.delete(JSON.stringify(payload));
                setQuantity("");
                setReason("");
                setMessage("Stok hareketi kaydedildi.");
                await load();
                setMessage("Stok hareketi kaydedildi.");
              })}
              {button(
                selected.isPublic
                  ? "Ürünü müşterilerden gizle"
                  : "Ürünü müşteri kataloğunda göster",
                async () => {
                  await api.request(`${base}/${selected.id}`, "PATCH", {
                    expectedRevision: selected.revision,
                    isPublic: !selected.isPublic,
                  });
                  await load();
                  setMessage("Ürünün katalog görünürlüğü kaydedildi.");
                },
              )}
              {button(
                selected.isActive ? "Ürünü pasife al" : "Ürünü aktifleştir",
                async () => {
                  await api.request(`${base}/${selected.id}`, "PATCH", {
                    expectedRevision: selected.revision,
                    isActive: !selected.isActive,
                  });
                  await load();
                  setMessage("Ürün durumu kaydedildi.");
                },
              )}
              {button("Son stok hareketlerini yükle", async () =>
                setHistory(
                  await api.request<StockMovement[]>(
                    `${base}/${selected.id}/movements`,
                  ),
                ),
              )}
              {history.map((item) => (
                <Text key={item.id} style={styles.body}>
                  {item.direction === "IN" ? "+" : "−"}
                  {item.quantity} {unitLabel[selected.unit]} · {item.reason} ·{" "}
                  {new Date(item.createdAt).toLocaleString("tr-TR")} · Kalan:{" "}
                  {item.quantityAfter}
                </Text>
              ))}
            </View>
          )}
          <Text style={styles.heading}>Toplu ürün ekle</Text>
          <Text style={styles.body}>
            Tablodan 7 sütunu bu sırayla kopyala: Ürün kodu, ürün adı, marka,
            fiyat, para birimi, birim, düşük stok eşiği. En fazla 50 satır;
            birim UNIT (adet), ML veya G. Fiyatta binlik ayırıcı kullanma. İlk
            stok sıfırdır; giriş hareketiyle eklenir.
          </Text>
          <TextInput
            accessibilityLabel="Toplu ürün satırları"
            multiline
            style={[styles.input, styles.paste]}
            editable={!busy}
            value={paste}
            onChangeText={(value) => {
              setPaste(value);
              setPreview([]);
            }}
            maxLength={50000}
            placeholderTextColor={palette.muted}
            placeholder="Tablodan kopyalanan satırları yapıştır"
          />
          {button("Ürün listesini önizle", async () => {
            try {
              setPreview(parseProductRows(paste));
              setMessage("");
            } catch (error) {
              setPreview([]);
              setMessage(
                error instanceof Error ? error.message : "Listeyi kontrol et.",
              );
            }
          })}
          {!!preview.length && (
            <View style={styles.card}>
              <Text style={styles.heading}>
                {preview.length} ürün eklenmeye hazır
              </Text>
              {preview.map((p) => (
                <Text key={p.sku} style={styles.body}>
                  {p.sku} · {p.name} · {formatPrice(p.price, p.currency)}
                </Text>
              ))}
              <Text style={styles.body}>
                Yeni ürünler işletmeye özel kaydedilir. Müşteri görünürlüğünü
                ürün kartından açabilirsin.
              </Text>
              {button("Önizlenen ürünleri toplu kaydet", async () => {
                await api.request(`${base}/import`, "POST", {
                  products: preview,
                  idempotencyKey: key(preview),
                });
                keys.current.delete(JSON.stringify(preview));
                setPaste("");
                setPreview([]);
                setMessage("Ürünler toplu kaydedildi.");
                await load();
                setMessage("Ürünler toplu kaydedildi.");
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 14 },
  title: { color: palette.text, fontSize: 24, fontWeight: "600" },
  heading: {
    color: palette.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  body: { color: palette.muted, fontSize: 13, lineHeight: 22 },
  price: { color: palette.lavender, fontSize: 18, fontWeight: "600" },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
    backgroundColor: palette.field,
    gap: 10,
  },
  selected: { borderColor: palette.lavender },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    padding: 14,
    backgroundColor: palette.primary,
    borderRadius: 14,
    minHeight: 48,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 14, textAlign: "center" },
  input: {
    backgroundColor: palette.field,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 14,
    minHeight: 50,
  },
  paste: { minHeight: 140, textAlignVertical: "top" },
  disabled: { opacity: 0.5 },
});
