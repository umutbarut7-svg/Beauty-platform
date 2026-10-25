import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type { MvpApiClient } from "@beauty-platform/types";
import { AppText as Text, palette } from "./ui";

type Receipt = {
  status: "NONE" | "REQUESTED";
  request: { id: string; requestedAt: string } | null;
  deletionCompleted: false;
};

export function AccountDeletion({
  api,
  busy,
  run,
}: {
  api: MvpApiClient;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  function button(
    label: string,
    action: () => Promise<void>,
    disabled = false,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy || disabled}
        style={[styles.button, (busy || disabled) && styles.disabled]}
        onPress={() => void run(action)}
      >
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Hesap silme</Text>
      <Text style={styles.body}>
        Hesabın ve ilişkili kişisel verilerin için silme talebi
        oluşturabilirsin. Talep oluşturmak hesabını hemen silmez.
      </Text>
      {receipt?.status === "REQUESTED" ? (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Silme talebin alındı. Hesabın ve verilerin henüz silinmedi.
          </Text>
          <Text style={styles.body}>Talep numarası: {receipt.request?.id}</Text>
          {button("Silme talebinin durumunu yenile", async () => {
            setReceipt(await api.request<Receipt>("/auth/account-deletion"));
          })}
        </>
      ) : confirming ? (
        <>
          <Text style={styles.body}>
            Devam etmek için parolanı gir ve onay alanına HESABIMI SIL yaz. Bu
            adım yalnızca kendi hesabın için talep oluşturur.
          </Text>
          <TextInput
            accessibilityLabel="Hesap silme parolası"
            placeholder="Mevcut parolan"
            placeholderTextColor={palette.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Hesap silme onayı"
            placeholder="HESABIMI SIL"
            placeholderTextColor={palette.muted}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />
          {button(
            "Hesap silme talebini onayla",
            async () => {
              try {
                const result = await api.request<Receipt>(
                  "/auth/account-deletion",
                  "POST",
                  { password, confirmation },
                );
                setReceipt(result);
                setConfirming(false);
                setConfirmation("");
              } finally {
                setPassword("");
              }
            },
            !password || confirmation !== "HESABIMI SIL",
          )}
          {button("Silme talebinden vazgeç", async () => {
            setPassword("");
            setConfirmation("");
            setConfirming(false);
          })}
        </>
      ) : (
        button("Hesap silme talebi oluştur", async () => {
          const result = await api.request<Receipt>("/auth/account-deletion");
          setReceipt(result);
          setConfirming(result.status === "NONE");
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    backgroundColor: palette.surface,
    borderRadius: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heading: { color: palette.text, fontSize: 20, fontWeight: "600" },
  body: { color: palette.muted, fontSize: 14, lineHeight: 22 },
  input: {
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    borderRadius: 16,
  },
  button: { padding: 16, borderRadius: 16, backgroundColor: palette.raised },
  disabled: { opacity: 0.5 },
  label: { color: palette.lavender, fontWeight: "600" },
});
