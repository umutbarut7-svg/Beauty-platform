import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type {
  MvpApiClient,
  ProductPage,
  PublicProduct,
} from "@beauty-platform/types";
import { AppText as Text, formatPrice, palette } from "./ui";
export function PublicProducts({
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
  const [items, setItems] = useState<PublicProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  async function load(more = false) {
    const result = await api.request<ProductPage<PublicProduct>>(
      `/mvp/v1/catalog/${businessId}/products${more && cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
    );
    setItems(
      more
        ? [
            ...items,
            ...result.items.filter(
              (p) => !items.some((old) => old.id === p.id),
            ),
          ]
        : result.items,
    );
    setCursor(result.nextCursor);
    setLoaded(true);
  }
  const button = (label: string, more = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      style={styles.button}
      onPress={() => void run(() => load(more))}
    >
      <Text style={styles.action}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>İşletmenin ürünleri</Text>
      {button(loaded ? "Ürün kataloğunu yenile" : "İşletmenin ürünlerini gör")}
      {loaded && !items.length && (
        <Text style={styles.body}>Henüz müşteriye açık ürün yok.</Text>
      )}
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.title}>{item.name}</Text>
          {!!item.brand && <Text style={styles.body}>{item.brand}</Text>}
          {!!item.description && (
            <Text style={styles.body}>{item.description}</Text>
          )}
          <Text style={styles.price}>
            {formatPrice(item.price, item.currency)}
          </Text>
          <Text style={styles.body}>
            {item.availability === "IN_STOCK" ? "Stokta mevcut" : "Stokta yok"}
          </Text>
        </View>
      ))}
      {!!cursor && button("Daha fazla ürün göster", true)}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 14 },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 26,
  },
  body: { color: palette.muted, fontSize: 13, lineHeight: 22 },
  price: { color: palette.lavender, fontSize: 18, fontWeight: "600" },
  button: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  action: { color: palette.lavender, textAlign: "center" },
  card: {
    borderRadius: 16,
    backgroundColor: palette.field,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 10,
  },
});
