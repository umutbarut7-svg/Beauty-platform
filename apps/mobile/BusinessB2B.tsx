import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type {
  B2BProduct,
  B2BQuote,
  B2BSupplier,
  MvpApiClient,
  ProductPage,
  SupplierKind,
  SupplierProfile,
} from "@beauty-platform/types";
import { AppText as Text, formatPrice, palette } from "./ui";
const kinds: Record<SupplierKind, string> = {
  BRAND: "Marka",
  MANUFACTURER: "Üretici",
  DISTRIBUTOR: "Distribütör",
  WHOLESALER: "Toptancı",
};
const units = { UNIT: "adet", ML: "ml", G: "g" };
const statusNames = {
  REQUESTED: "Yanıt bekliyor",
  QUOTED: "Fiyat teklifi geldi",
  DECLINED: "Reddedildi",
  CANCELLED: "İptal edildi",
};
export function BusinessB2B({
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
  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState<B2BSupplier[]>([]);
  const [supplierCursor, setSupplierCursor] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [supplier, setSupplier] = useState<B2BSupplier | null>(null);
  const [products, setProducts] = useState<B2BProduct[]>([]);
  const [productCursor, setProductCursor] = useState<string | null>(null);
  const [product, setProduct] = useState<B2BProduct | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [quotes, setQuotes] = useState<B2BQuote[]>([]);
  const [quoteCursor, setQuoteCursor] = useState<string | null>(null);
  const [quoteSide, setQuoteSide] = useState<"BUYER" | "SUPPLIER">("BUYER");
  const [quotesLoaded, setQuotesLoaded] = useState(false);
  const [quote, setQuote] = useState<B2BQuote | null>(null);
  const [replyPrice, setReplyPrice] = useState("");
  const [replyCurrency, setReplyCurrency] = useState("");
  const [replyNote, setReplyNote] = useState("");
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [kind, setKind] = useState<SupplierKind | null>(null);
  const [description, setDescription] = useState("");
  const [listed, setListed] = useState(false);
  const keys = useRef(new Map<string, string>());
  const base = `/businesses/${businessId}/b2b`;
  const button = (label: string, action: () => Promise<void>) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={() => void run(action)}
      style={[styles.button, busy && styles.disabled]}
    >
      <Text style={styles.action}>{label}</Text>
    </Pressable>
  );
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
    maxLength = 1000,
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={palette.muted}
      value={value}
      onChangeText={change}
      editable={!busy}
      maxLength={maxLength}
      style={styles.input}
    />
  );
  const operationKey = (payload: unknown) => {
    const text = JSON.stringify(payload);
    let key = keys.current.get(text);
    if (!key) {
      key = `b2b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      keys.current.set(text, key);
    }
    return key;
  };
  async function loadQuotes(side: "BUYER" | "SUPPLIER", more = false) {
    const page = await api.request<ProductPage<B2BQuote>>(
      `${base}/quotes?side=${side}${more && quoteCursor ? `&after=${encodeURIComponent(quoteCursor)}` : ""}`,
    );
    setQuotes(
      more
        ? [
            ...quotes,
            ...page.items.filter((p) => !quotes.some((old) => old.id === p.id)),
          ]
        : page.items,
    );
    setQuoteCursor(page.nextCursor);
    setQuoteSide(side);
    setQuotesLoaded(true);
    setQuote(null);
    setReplyPrice("");
    setReplyCurrency("");
    setReplyNote("");
  }
  async function search(more = false) {
    const page = await api.request<ProductPage<B2BSupplier>>(
      `${base}/suppliers?query=${encodeURIComponent(query.trim())}${more && supplierCursor ? `&after=${encodeURIComponent(supplierCursor)}` : ""}`,
    );
    setSuppliers(
      more
        ? [
            ...suppliers,
            ...page.items.filter(
              (p) => !suppliers.some((old) => old.id === p.id),
            ),
          ]
        : page.items,
    );
    setSupplierCursor(page.nextCursor);
    setSearched(true);
    setSupplier(null);
    setProducts([]);
    setProduct(null);
  }
  async function loadProducts(selected: B2BSupplier, more = false) {
    const page = await api.request<ProductPage<B2BProduct>>(
      `${base}/suppliers/${selected.id}/products${more && productCursor ? `?after=${encodeURIComponent(productCursor)}` : ""}`,
    );
    setSupplier(selected);
    setProducts(
      more
        ? [
            ...products,
            ...page.items.filter(
              (p) => !products.some((old) => old.id === p.id),
            ),
          ]
        : page.items,
    );
    setProductCursor(page.nextCursor);
    setProduct(null);
    setQuantity("");
    setNote("");
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Tedarikçiler ve B2B</Text>
      <Text style={styles.body}>
        Markalar, üreticiler, distribütörler ve toptancılarla bağlantı kur. Bu
        bölümdeki talep ve fiyat yanıtları sipariş, ödeme veya stok rezervasyonu
        oluşturmaz.
      </Text>
      {!!message && (
        <Text accessibilityRole="alert" style={styles.body}>
          {message}
        </Text>
      )}
      <View style={styles.card}>
        <Text style={styles.heading}>Tedarikçi bul</Text>
        {field(
          "Tedarikçi veya marka ara",
          query,
          (value) => {
            setQuery(value);
            setSuppliers([]);
            setSearched(false);
            setSupplierCursor(null);
            setSupplier(null);
            setProducts([]);
            setProduct(null);
            setQuantity("");
            setNote("");
          },
          120,
        )}
        {button("Tedarikçileri ara", () => search())}
        {searched && !suppliers.length && (
          <Text style={styles.body}>
            Aramana uygun açık tedarikçi profili yok.
          </Text>
        )}
        {suppliers.map((s) => (
          <View key={s.id} style={styles.card}>
            <Text style={styles.heading}>{s.name}</Text>
            <Text style={styles.body}>
              {kinds[s.supplierProfile.kind]} ·{" "}
              {s.isVerified
                ? "Doğrulanmış işletme"
                : "İşletme doğrulaması bekliyor"}
            </Text>
            <Text style={styles.body}>{s.supplierProfile.description}</Text>
            {button(`${s.name} B2B ürünlerini gör`, () => loadProducts(s))}
          </View>
        ))}
        {!!supplierCursor &&
          button("Diğer tedarikçileri yükle", () => search(true))}
      </View>
      {supplier && (
        <View style={styles.card}>
          <Text style={styles.heading}>{supplier.name} · Ürünler</Text>
          {!products.length && (
            <Text style={styles.body}>
              Tedarikçi henüz B2B ürünü yayımlamadı.
            </Text>
          )}
          {products.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${p.name} için teklif iste`}
              aria-pressed={product?.id === p.id}
              accessibilityState={{
                selected: product?.id === p.id,
                disabled: busy,
              }}
              disabled={busy}
              style={[styles.card, product?.id === p.id && styles.selected]}
              onPress={() => {
                setProduct(p);
                setQuantity("");
                setNote("");
              }}
            >
              <Text style={styles.heading}>{p.name}</Text>
              <Text style={styles.body}>
                {p.brand ? `${p.brand} · ` : ""}
                {p.sku} · {units[p.unit]}
              </Text>
              <Text style={styles.price}>
                Katalog fiyatı: {formatPrice(p.price, p.currency)}
              </Text>
            </Pressable>
          ))}
          {!!productCursor &&
            button("Diğer B2B ürünlerini yükle", () =>
              loadProducts(supplier, true),
            )}
          {product && (
            <>
              <Text style={styles.body}>
                Talep miktarı ve ürün bilgisi tedarikçiye uygulama içinde
                iletilir.
              </Text>
              {field(
                `Talep miktarı (${units[product.unit]})`,
                quantity,
                setQuantity,
                30,
              )}
              {field("Tedarikçiye not", note, setNote)}
              {button("Teklif talebini gönder", async () => {
                const amount = quantity.trim().replace(",", ".");
                if (
                  !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(amount) ||
                  Number(amount) <= 0 ||
                  (product.unit === "UNIT" && !Number.isInteger(Number(amount)))
                ) {
                  setMessage(
                    "Pozitif miktar gir. Adet biriminde tam sayı kullan.",
                  );
                  return;
                }
                const payload = {
                  supplierBusinessId: supplier.id,
                  productId: product.id,
                  quantity: amount,
                  note: note.trim(),
                };
                await api.request(`${base}/quotes`, "POST", {
                  ...payload,
                  idempotencyKey: operationKey(payload),
                });
                keys.current.delete(JSON.stringify(payload));
                setQuantity("");
                setNote("");
                setMessage("Teklif talebi kaydedildi. Henüz sipariş oluşmadı.");
                await loadQuotes("BUYER");
              })}
            </>
          )}
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.heading}>Talepler ve fiyat yanıtları</Text>
        {quotesLoaded && (
          <Text style={styles.body}>
            {quoteSide === "BUYER" ? "Gönderdiğim talepler" : "Gelen talepler"}
            {quotes.length ? "" : " · Henüz kayıt yok"}
          </Text>
        )}
        {button("Gönderdiğim teklif taleplerini yükle", () =>
          loadQuotes("BUYER"),
        )}
        {button("Gelen teklif taleplerini yükle", () => loadQuotes("SUPPLIER"))}
        {quotes.map((q, i) => (
          <Pressable
            key={q.id}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}. ${q.productName} talebini aç`}
            aria-pressed={quote?.id === q.id}
            disabled={busy}
            style={[styles.card, quote?.id === q.id && styles.selected]}
            onPress={() => {
              setQuote(q);
              setReplyPrice("");
              setReplyCurrency("");
              setReplyNote("");
            }}
          >
            <Text style={styles.heading}>{q.productName}</Text>
            <Text style={styles.body}>
              {q.buyer.name} → {q.supplier.name}
            </Text>
            <Text style={styles.body}>
              {q.quantity} {units[q.unit]} · {statusNames[q.status]}
            </Text>
          </Pressable>
        ))}
        {!!quoteCursor &&
          button("Diğer teklif taleplerini yükle", () =>
            loadQuotes(quoteSide, true),
          )}
        {quote && (
          <View style={styles.card}>
            <Text style={styles.heading}>{quote.productName} · Talep</Text>
            <Text style={styles.body}>
              {quote.quantity} {units[quote.unit]} · {statusNames[quote.status]}
            </Text>
            {!!quote.buyerNote && (
              <Text style={styles.body}>Alıcı notu: {quote.buyerNote}</Text>
            )}
            {!!quote.supplierNote && (
              <Text style={styles.body}>
                Tedarikçi notu: {quote.supplierNote}
              </Text>
            )}
            {quote.quotedUnitPrice !== null && quote.currency && (
              <Text style={styles.price}>
                Teklif edilen birim fiyat:{" "}
                {formatPrice(quote.quotedUnitPrice, quote.currency)} /{" "}
                {units[quote.unit]}
              </Text>
            )}
            {quoteSide === "BUYER" &&
              ["REQUESTED", "QUOTED"].includes(quote.status) &&
              button("Teklif talebini iptal et", async () => {
                await api.request(`${base}/quotes/${quote.id}/cancel`, "POST", {
                  expectedRevision: quote.revision,
                });
                await loadQuotes("BUYER");
                setMessage("Teklif talebi iptal edildi.");
              })}
            {quoteSide === "SUPPLIER" && quote.status === "REQUESTED" && (
              <>
                {field(
                  `Teklif birim fiyatı (${units[quote.unit]})`,
                  replyPrice,
                  setReplyPrice,
                  30,
                )}
                {field(
                  "Teklif para birimi",
                  replyCurrency,
                  setReplyCurrency,
                  3,
                )}
                {field("Alıcıya yanıt notu", replyNote, setReplyNote)}
                {button("Fiyat teklifini kaydet", async () => {
                  const price = replyPrice.trim().replace(",", ".");
                  if (
                    !/^\d{1,10}(?:\.\d{1,2})?$/.test(price) ||
                    !/^[A-Z]{3}$/.test(replyCurrency.trim())
                  ) {
                    setMessage(
                      "Birim fiyat ve üç harfli para birimini kontrol et.",
                    );
                    return;
                  }
                  await api.request(
                    `${base}/quotes/${quote.id}/reply`,
                    "POST",
                    {
                      expectedRevision: quote.revision,
                      action: "QUOTE",
                      unitPrice: price,
                      currency: replyCurrency.trim(),
                      note: replyNote.trim(),
                    },
                  );
                  await loadQuotes("SUPPLIER");
                  setMessage("Fiyat yanıtı kaydedildi.");
                })}
                {button("Teklif talebini reddet", async () => {
                  await api.request(
                    `${base}/quotes/${quote.id}/reply`,
                    "POST",
                    {
                      expectedRevision: quote.revision,
                      action: "DECLINE",
                      note: replyNote.trim(),
                    },
                  );
                  await loadQuotes("SUPPLIER");
                  setMessage("Talep reddedildi.");
                })}
              </>
            )}
          </View>
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Tedarikçi profilim</Text>
        {button("Tedarikçi profilimi yükle", async () => {
          const p = await api.request<SupplierProfile | null>(
            `${base}/profile`,
          );
          setProfile(p);
          setKind(p?.kind ?? null);
          setDescription(p?.description ?? "");
          setListed(p?.isListed ?? false);
          setProfileLoaded(true);
        })}
        {profileLoaded && (
          <>
            <Text style={styles.body}>
              Firma türü işletme beyanıdır. İşletme doğrulaması ayrıca
              değerlendirilir. Listeleme için işletme profilinin açık ve aktif
              olması gerekir.
            </Text>
            {(Object.entries(kinds) as [SupplierKind, string][]).map(
              ([value, label]) => (
                <View key={value}>
                  {button(
                    `${label}${kind === value ? " · Seçili" : ""}`,
                    async () => setKind(value),
                  )}
                </View>
              ),
            )}
            {field(
              "Tedarikçi profil açıklaması",
              description,
              setDescription,
              2000,
            )}
            {button(
              listed ? "Listede göster: Evet" : "Listede göster: Hayır",
              async () => setListed(!listed),
            )}
            {button("Tedarikçi profilini kaydet", async () => {
              if (!kind) {
                setMessage("Firma türünü seç.");
                return;
              }
              await api.request(`${base}/profile`, "PATCH", {
                kind,
                description: description.trim(),
                isListed: listed,
                ...(profile ? { expectedRevision: profile.revision } : {}),
              });
              const p = await api.request<SupplierProfile>(`${base}/profile`);
              setProfile(p);
              setMessage(
                "Tedarikçi profili kaydedildi. B2B ürün görünürlüğünü ürün ve stok ekranından yönetebilirsin.",
              );
            })}
          </>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 16 },
  title: { color: palette.text, fontSize: 25, fontWeight: "600" },
  heading: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 25,
  },
  body: { color: palette.muted, fontSize: 13, lineHeight: 22 },
  price: {
    color: palette.lavender,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 25,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.field,
    gap: 12,
  },
  selected: { borderColor: palette.lavender },
  button: {
    backgroundColor: palette.primary,
    padding: 14,
    borderRadius: 14,
    minHeight: 48,
  },
  action: { color: "#fff", textAlign: "center", fontSize: 14, lineHeight: 21 },
  input: {
    backgroundColor: palette.surface,
    color: palette.text,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 50,
  },
  disabled: { opacity: 0.5 },
});
