import { AppText as Text, palette } from "./ui";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { ApiError } from "@beauty-platform/types";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { PhotoPreparationError, prepareWebPhoto } from "./photo-upload";
import type {
  MvpApiClient,
  MvpVisualSession,
  PhotoCapability,
  SemanticMatches,
} from "@beauty-platform/types";

export function VisualJourney({
  api,
  intent,
  target,
  busy,
  run,
  report,
  choose,
}: {
  api: MvpApiClient;
  intent: string;
  target: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  report: (error: unknown) => void;
  choose: (business: {
    id: string;
    name: string;
    isVerified: boolean;
  }) => Promise<void>;
}) {
  const [capability, setCapability] = useState<PhotoCapability | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [consentId, setConsentId] = useState("");
  const [session, setSession] = useState<MvpVisualSession | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [matches, setMatches] = useState<SemanticMatches | null>(null);
  const [matchingState, setMatchingState] = useState<
    "checking" | "available" | "unavailable" | "error"
  >("checking");
  const [matchingRefresh, setMatchingRefresh] = useState(0);
  const [message, setMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [activeConsents, setActiveConsents] = useState<
    Array<{ id: string; expiresAt: string }>
  >([]);
  const generation = useRef(0);
  const reportCapabilityError = useEffectEvent((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) report(error);
  });
  const matchingAvailable = useCallback(async () => {
    const value = await api.request<{
      enabled?: boolean;
      matching?: { semanticVectorAvailable?: boolean };
    }>("/mvp/v1/capabilities");
    return (
      value.enabled === true && value.matching?.semanticVectorAvailable === true
    );
  }, [api]);
  useEffect(() => {
    if (session?.status !== "PLAN") return;
    let active = true;
    setMatchingState("checking");
    void matchingAvailable().then(
      (available) => {
        if (!active) return;
        setMatchingState(available ? "available" : "unavailable");
        if (!available) setMatches(null);
      },
      (error: unknown) => {
        if (!active) return;
        setMatchingState("error");
        setMatches(null);
        reportCapabilityError(error);
      },
    );
    return () => {
      active = false;
    };
    // Capability reads never start analysis or a paid matching request.
  }, [matchingAvailable, session?.id, session?.status, matchingRefresh]);
  const button = (label: string, action: () => Promise<void>) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy || withdrawing}
      style={styles.button}
      onPress={() => void run(action)}
    >
      <Text style={styles.white}>{label}</Text>
    </Pressable>
  );
  async function analyze() {
    if (!session) return;
    const epoch = generation.current;
    const next = await api.request<MvpVisualSession>(
      `/mvp/v1/visual/sessions/${session.id}/analyze`,
      "POST",
      {
        answers: session.status === "NEEDS_INFORMATION" ? answers : [],
        expectedAttempt: session.attempts,
      },
      { timeoutMs: 45000 },
    );
    if (generation.current !== epoch) return;
    setSession(next);
    setAnswers([]);
    setMatches(null);
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Fotoğraflı danışmanlık</Text>
      {button("Görsel danışmanlık durumunu yükle", async () => {
        const value = await api.request<PhotoCapability>(
          "/mvp/v1/photos/policy",
        );
        setCapability(value);
        setAccepted(false);
      })}
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
      {button("Aktif fotoğraf izinlerimi yükle", async () => {
        setActiveConsents(await api.request("/mvp/v1/photos/consents"));
      })}
      {activeConsents
        .filter((consent) => consent.id !== consentId)
        .map((consent, index) => (
          <View key={consent.id}>
            <Text>
              Fotoğraf izni {index + 1} · Son kullanım:{" "}
              {new Date(consent.expiresAt).toLocaleString("tr-TR")}
            </Text>
            {button(`Fotoğraf izni ${index + 1} için geri çek`, async () => {
              await api.request(
                `/mvp/v1/photos/consents/${consent.id}/withdraw`,
                "POST",
              );
              setActiveConsents((current) =>
                current.filter((c) => c.id !== consent.id),
              );
              setMessage(
                "İzin geri çekildi. Erişim kapatıldı; fiziksel silme işleniyor.",
              );
            })}
          </View>
        ))}
      {capability && !capability.available && (
        <Text>
          Fotoğraf yükleme ve görsel analiz şu anda kullanılamıyor. Katalogdan
          hizmet ve randevu seçebilirsiniz.
        </Text>
      )}
      {capability?.available && capability.policy && (
        <>
          <Text>{capability.policy.notice}</Text>
          <Text>Azami saklama: {capability.policy.retentionHours} saat.</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Fotoğraf ve AI işlemeye açık izin veriyorum"
            accessibilityState={{ checked: accepted }}
            disabled={busy || withdrawing}
            onPress={() => setAccepted(!accepted)}
            style={styles.check}
          >
            <Text>
              {accepted ? "☑" : "☐"} Fotoğraf ve AI işlemeye açık izin veriyorum
            </Text>
          </Pressable>
          {button("İzinle fotoğraf seç ve yükle", async () => {
            if (!accepted || !intent.trim() || !target.trim()) {
              setMessage(
                "İsteğinizi ve hedefinizi yazıp izin metnini onaylayın.",
              );
              return;
            }
            const epoch = ++generation.current;
            setMessage("");
            setUploadMessage("");
            let cleanup: (() => void) | undefined;
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                base64: false,
                exif: false,
                quality: 0.8,
                ...(Platform.OS !== "web"
                  ? {
                      shouldDownloadFromNetwork: true,
                      preferredAssetRepresentationMode:
                        ImagePicker
                          .UIImagePickerPreferredAssetRepresentationMode
                          .Compatible,
                    }
                  : {}),
              });
              if (epoch !== generation.current) return;
              if (result.canceled || !result.assets[0]) {
                setUploadMessage("Fotoğraf seçimi iptal edildi.");
                return;
              }
              const asset = result.assets[0];
              setUploadMessage("Fotoğraf hazırlanıyor…");
              const form = new FormData();
              if (Platform.OS === "web") {
                const jpeg = await prepareWebPhoto(asset);
                form.append("photo", jpeg, "photo.jpg");
              } else {
                const { prepareDevicePhoto, appendDevicePhoto } =
                  await import("./native-photo-expo");
                const photo = await prepareDevicePhoto(asset);
                cleanup = photo.cleanup;
                appendDevicePhoto(form, photo);
              }
              if (epoch !== generation.current) return;
              setSession(null);
              setMatches(null);
              setAnswers([]);
              if (consentId)
                await api.request(
                  `/mvp/v1/photos/consents/${consentId}/withdraw`,
                  "POST",
                );
              if (epoch !== generation.current) return;
              const consent = await api.request<{ id: string }>(
                "/mvp/v1/photos/consents",
                "POST",
                { policyVersion: capability.policy!.version, accepted: true },
              );
              if (epoch !== generation.current) {
                await api.request(
                  `/mvp/v1/photos/consents/${consent.id}/withdraw`,
                  "POST",
                );
                return;
              }
              setConsentId(consent.id);
              setUploadMessage("Fotoğraf yükleniyor…");
              if (epoch !== generation.current) return;
              const photo = await api.request<{ id: string }>(
                `/mvp/v1/photos/upload/${consent.id}`,
                "POST",
                form,
                { multipart: true, timeoutMs: 45000 },
              );
              if (epoch !== generation.current) return;
              const next = await api.request<MvpVisualSession>(
                "/mvp/v1/visual/sessions",
                "POST",
                { photoId: photo.id, intent, target },
              );
              if (epoch !== generation.current) return;
              setSession(next);
              setUploadMessage(
                "Fotoğraf kaydedildi. Analizi başlatabilirsiniz.",
              );
            } catch (error) {
              if (epoch !== generation.current) return;
              setUploadMessage(
                error instanceof PhotoPreparationError
                  ? error.message
                  : "Fotoğraf yüklenemedi. Yeniden deneyin.",
              );
              if (!(error instanceof PhotoPreparationError)) throw error;
            } finally {
              cleanup?.();
            }
          })}
          {uploadMessage ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
              {uploadMessage}
            </Text>
          ) : null}
        </>
      )}
      {consentId && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fotoğraf iznimi geri çek"
          disabled={withdrawing}
          style={styles.button}
          onPress={() => {
            const id = consentId;
            generation.current++;
            setUploadMessage("");
            setSession(null);
            setMatches(null);
            setAnswers([]);
            setAccepted(false);
            setWithdrawing(true);
            void api
              .request(`/mvp/v1/photos/consents/${id}/withdraw`, "POST")
              .then(() => {
                setConsentId("");
                setMessage(
                  "İzniniz geri çekildi. Erişim kapatıldı; fotoğrafın fiziksel silinmesi işleniyor.",
                );
              })
              .catch(() => {
                setMessage("İzin geri çekilemedi. Yeniden deneyin.");
              })
              .finally(() => setWithdrawing(false));
          }}
        >
          <Text style={styles.white}>Fotoğraf iznimi geri çek</Text>
        </Pressable>
      )}
      {session && (
        <>
          <Text>
            Danışmanlık durumu:{" "}
            {(
              {
                CREATED: "Analize hazır",
                RUNNING: "İşleniyor",
                NEEDS_INFORMATION: "Yanıtınız bekleniyor",
                PLAN: "Plan hazır",
                FAILED: "Analiz tamamlanamadı",
                REVOKED: "İzin geri çekildi",
                EXPIRED: "Süresi doldu",
              } as Record<string, string>
            )[session.status] ?? "Yenileme gerekiyor"}
          </Text>
          {button("Analiz durumunu yenile", async () => {
            const epoch = generation.current;
            const next = await api.request<MvpVisualSession>(
              `/mvp/v1/visual/sessions/${session.id}`,
            );
            if (epoch === generation.current) {
              setSession(next);
              setAnswers([]);
            }
          })}
          {["CREATED", "FAILED"].includes(session.status) &&
            button("Görsel analizi başlat", analyze)}
          {session.output?.observations.map((line, i) => (
            <Text key={`o-${i}`}>{line}</Text>
          ))}
          {session.status === "NEEDS_INFORMATION" && (
            <>
              {session.output?.questions.map((question, i) => (
                <View key={`${session.attempts}-${i}`}>
                  <Text>{question}</Text>
                  <TextInput
                    placeholderTextColor={palette.muted}
                    accessibilityLabel={`Danışmanlık yanıtı ${i + 1}`}
                    value={answers[i] ?? ""}
                    maxLength={500}
                    editable={!busy && !withdrawing}
                    style={styles.input}
                    onChangeText={(text) =>
                      setAnswers((current) => {
                        const next = [...current];
                        next[i] = text;
                        return next;
                      })
                    }
                  />
                </View>
              ))}
              {button("Yanıtlarla analizi sürdür", analyze)}
            </>
          )}
          {session.status === "PLAN" && (
            <>
              <Text style={styles.heading}>Önerilen danışmanlık planı</Text>
              {session.output?.steps.map((line, i) => (
                <Text key={`s-${i}`}>
                  {i + 1}. {line}
                </Text>
              ))}
              {matchingState === "checking" && (
                <Text accessibilityLiveRegion="polite">
                  Eşleştirme durumu kontrol ediliyor…
                </Text>
              )}
              {matchingState === "unavailable" && (
                <Text accessibilityLiveRegion="polite">
                  Planına göre profesyonel arama şu anda kullanılamıyor. Planını
                  inceleyebilir veya Keşfet’ten hizmet ve randevu seçebilirsin.
                </Text>
              )}
              {matchingState === "error" && (
                <Text accessibilityRole="alert">
                  Eşleştirme durumu kontrol edilemedi. Planın bu ekranda
                  duruyor; yeniden deneyebilirsin.
                </Text>
              )}
              {["unavailable", "error"].includes(matchingState) &&
                button("Eşleştirme durumunu yenile", async () => {
                  setMatchingRefresh((value) => value + 1);
                })}
              {matchingState === "available" &&
                button("Plana göre profesyonel ara", async () => {
                  const epoch = generation.current;
                  setMatches(null);
                  let capabilityChecked = false;
                  try {
                    // Recheck at the explicit action: a flag can close after PLAN loads.
                    const available = await matchingAvailable();
                    if (epoch !== generation.current) return;
                    capabilityChecked = true;
                    if (!available) {
                      setMatchingState("unavailable");
                      return;
                    }
                    const result = await api.request<SemanticMatches>(
                      `/mvp/v1/visual/sessions/${session.id}/matches`,
                      "POST",
                      undefined,
                      { timeoutMs: 30000 },
                    );
                    if (epoch === generation.current) setMatches(result);
                  } catch (error) {
                    if (epoch !== generation.current) return;
                    if (error instanceof ApiError && error.status === 401)
                      throw error;
                    if (!capabilityChecked) {
                      setMatchingState("error");
                      return;
                    }
                    if (error instanceof ApiError && error.status === 503) {
                      setMatchingState("unavailable");
                      return;
                    }
                    throw error;
                  }
                })}
            </>
          )}
          {session.output?.limitations.map((line, i) => (
            <Text key={`l-${i}`}>{line}</Text>
          ))}
          <Text>
            Öneriler profesyonel değerlendirmesi gerektirir. İşlem veya sonuç
            garantisi verilmez.
          </Text>
        </>
      )}
      {matches?.status === "NO_MATCH" && (
        <Text>Uygun, güncel arama kaydı bulunamadı.</Text>
      )}
      {matches?.items.map((match) => (
        <View key={`${match.businessId}-${match.serviceId}`}>
          <Text>
            {match.businessName} · {match.serviceName}
          </Text>
          <Text>
            Anlamsal arama sonucu. Uygunluk ve müsaitlik ayrıca kontrol edilir.
          </Text>
          {button(`${match.serviceName} için hizmetleri gör`, () =>
            choose({
              id: match.businessId,
              name: match.businessName,
              isVerified: false,
            }),
          )}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 12 },
  heading: { fontSize: 18, fontWeight: "600", color: palette.text },
  button: { backgroundColor: palette.primary, borderRadius: 8, padding: 12 },
  white: { color: "white" },
  check: {
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
  },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    backgroundColor: palette.field,
    color: palette.text,
  },
});
