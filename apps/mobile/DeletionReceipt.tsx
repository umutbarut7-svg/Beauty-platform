import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type { MvpApiClient } from "@beauty-platform/types";
import { AppText as Text, palette } from "./ui";
type Receipt = {
  status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "RESTORE_REVIEW";
  deletionCompleted: boolean;
  completedAt: string | null;
};
export function DeletionReceipt({
  api,
  busy,
  run,
}: {
  api: MvpApiClient;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hesap silme durumunu takip et"
        disabled={busy}
        onPress={() => {
          setOpen(!open);
          setToken("");
          setReceipt(null);
        }}
      >
        <Text style={styles.label}>Hesap silme durumunu takip et</Text>
      </Pressable>
      {open && (
        <>
          <Text style={styles.body}>
            Hesabın kapandıktan sonra da sakladığın takip koduyla sonucu
            görebilirsin. Kodunu başkalarıyla paylaşma.
          </Text>
          <TextInput
            accessibilityLabel="Silme takip kodu"
            value={token}
            onChangeText={(value) => {
              setToken(value);
              setReceipt(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={!busy}
            maxLength={150}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Silme sonucunu sorgula"
            disabled={busy || !token}
            onPress={() =>
              void run(async () => {
                setReceipt(null);
                setReceipt(
                  await api.request<Receipt>(
                    "/auth/account-deletion/receipt",
                    "POST",
                    { token },
                  ),
                );
              })
            }
          >
            <Text style={styles.label}>Silme sonucunu sorgula</Text>
          </Pressable>
          {receipt && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {receipt.deletionCompleted && receipt.status === "COMPLETED"
                ? "Hesabın kalıcı olarak silindi."
                : receipt.status === "RESTORE_REVIEW"
                  ? "Talebin yeniden doğrulanıyor; tamamlanma sonucu henüz doğrulanamadı."
                  : receipt.status === "PROCESSING"
                    ? "Talebin işleniyor; silme henüz tamamlanmadı."
                    : "Silme talebin alındı; hesabın henüz silinmedi."}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 20,
    gap: 14,
    backgroundColor: palette.surface,
    borderRadius: 22,
  },
  label: { color: palette.lavender, fontWeight: "600" },
  body: { color: palette.muted, lineHeight: 22 },
  input: {
    color: palette.text,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
});
