import { useState } from "react";
import { Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import type { MvpApiClient, OrzellShareTarget } from "@beauty-platform/types";
import { AppText as Text, palette } from "./ui";
import { prepareServiceShare } from "./service-share";

export function ServiceShare({
  api,
  target,
  origin,
  busy,
  run,
}: {
  api: MvpApiClient;
  target: OrzellShareTarget;
  origin: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Awaited<
    ReturnType<typeof prepareServiceShare>
  > | null>(null);
  const [approved, setApproved] = useState(false);
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>Hizmet bağlantısı</Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={styles.button}
        onPress={() =>
          void run(async () => {
            setDraft(null);
            setApproved(false);
            setDraft(await prepareServiceShare(api, origin, target));
          })
        }
      >
        <Text>Paylaşım bağlantısını hazırla</Text>
      </Pressable>
      {draft && (
        <>
          <Text>
            {draft.published.business.name} · {draft.published.service.name}
          </Text>
          {draft.published.professionals.map((staff) => (
            <Text key={staff.id}>
              {staff.displayName} · {staff.price}{" "}
              {draft.published.service.currency} · {staff.durationMinutes}{" "}
              dakika
            </Text>
          ))}
          <TextInput
            accessibilityLabel="Hizmet paylaşım bağlantısı"
            value={draft.url}
            editable={false}
            selectTextOnFocus
            style={styles.link}
          />
          <Text>
            Bağlantıyı seçip kopyalayabilir veya paylaşım menüsünü
            açabilirsiniz.
          </Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: approved, disabled: busy }}
            disabled={busy}
            onPress={() => setApproved(!approved)}
            style={styles.button}
          >
            <Text>
              {approved ? "✓ " : ""}Bu hizmet bağlantısını paylaşmayı
              onaylıyorum
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !approved }}
            disabled={busy || !approved}
            style={[styles.button, (busy || !approved) && styles.disabled]}
            onPress={() =>
              void run(async () => {
                // Revalidate publication/ownership immediately before opening the user's share sheet.
                setDraft(null);
                setApproved(false);
                const current = await prepareServiceShare(api, origin, target);
                await Share.share({
                  message: `${current.published.business.name} · ${current.published.service.name}\n${current.url}`,
                });
              })
            }
          >
            <Text>Paylaşım menüsünü aç</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  box: {
    gap: 12,
    padding: 16,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 16,
  },
  heading: { fontSize: 18, fontWeight: "700" },
  button: { padding: 14, borderRadius: 12, backgroundColor: palette.raised },
  link: {
    padding: 12,
    color: palette.text,
    backgroundColor: palette.field,
    borderRadius: 10,
  },
  disabled: { opacity: 0.5 },
});
