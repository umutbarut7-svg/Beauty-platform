import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import {
  type MvpApiClient,
  type OrzellShareTarget,
} from "@beauty-platform/types";
import { subscribeServiceLinks } from "./incoming-links";
import { prepareServiceShare } from "./service-share";
import { AppText, palette } from "./ui";

export function IncomingService({ api }: { api: MvpApiClient }) {
  const origin = process.env.EXPO_PUBLIC_ORZELL_WEB_ORIGIN;
  const [target, setTarget] = useState<OrzellShareTarget | null>(null);
  useEffect(() => {
    if (
      Platform.OS === "web" ||
      process.env.EXPO_PUBLIC_ORZELL_NATIVE_SERVICE_LINKS_ENABLED !== "true" ||
      process.env.EXPO_PUBLIC_ORZELL_EVERYWHERE_ENABLED !== "true" ||
      !origin
    )
      return;
    return subscribeServiceLinks(Linking, origin, setTarget);
  }, [origin]);
  if (!target || !origin) return null;
  return (
    <Preview
      key={JSON.stringify(target)}
      api={api}
      origin={origin}
      target={target}
      dismiss={() => setTarget(null)}
    />
  );
}

function Preview({
  api,
  origin,
  target,
  dismiss,
}: {
  api: MvpApiClient;
  origin: string;
  target: OrzellShareTarget;
  dismiss: () => void;
}) {
  const [draft, setDraft] = useState<Awaited<
    ReturnType<typeof prepareServiceShare>
  > | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void prepareServiceShare(api, origin, target).then(
      (value) => {
        if (active) setDraft(value);
      },
      () => {
        if (active) setMessage("Bu hizmet bağlantısı şu anda kullanılamıyor.");
      },
    );
    return () => {
      active = false;
    };
  }, [api, origin, target]);
  const service = draft?.published.service;
  const staff = target.professionalId
    ? draft?.published.professionals[0]
    : undefined;
  return (
    <View style={{ padding: 16, gap: 10, backgroundColor: palette.surface }}>
      {draft && service ? (
        <>
          <AppText accessibilityRole="header">
            {service.name} · {draft.published.business.name}
          </AppText>
          {staff && <AppText>{staff.displayName}</AppText>}
          <AppText>
            {staff?.price ?? service.price} {service.currency} ·{" "}
            {staff?.durationMinutes ?? service.durationMinutes} dakika
          </AppText>
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              const url = new URL(draft.url);
              url.pathname = "/book/service";
              void Linking.openURL(url.href).catch(() =>
                setMessage("Tarayıcı açılamadı. Yeniden deneyin."),
              );
            }}
          >
            <AppText>Hizmeti tarayıcıda aç</AppText>
          </Pressable>
          {message && <AppText>{message}</AppText>}
        </>
      ) : (
        <AppText>{message || "Hizmet bilgileri yükleniyor…"}</AppText>
      )}
      <Pressable accessibilityRole="button" onPress={dismiss}>
        <AppText>Paylaşımı kapat</AppText>
      </Pressable>
    </View>
  );
}
