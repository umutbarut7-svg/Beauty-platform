import { AppText as Text, palette } from "./ui";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type {
  MvpApiClient,
  MvpVerificationPolicy,
  MvpVerificationRequest,
  SemanticMatches,
} from "@beauty-platform/types";
const statusLabels: Record<string, string> = {
  SUBMITTED: "İnceleme bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  REVOKED: "Doğrulama geri alındı",
  CANCELLED: "İptal edildi",
  EXPIRED: "Süresi doldu",
};
export function BusinessIntelligenceSetup({
  api,
  businessId,
  busy,
  run,
  choose,
}: {
  api: MvpApiClient;
  businessId: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  choose?: (id: string) => Promise<void>;
}) {
  const [policy, setPolicy] = useState<MvpVerificationPolicy | null>(null);
  const [requests, setRequests] = useState<MvpVerificationRequest[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SemanticMatches | null>(null);
  const [message, setMessage] = useState("");
  const base = `/mvp/v1/businesses/${businessId}`;
  const button = (label: string, action: () => Promise<void>) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      style={styles.button}
      onPress={() => void run(action)}
    >
      <Text style={styles.white}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>İşletme doğrulaması</Text>
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
      {button("Doğrulama koşullarını yükle", async () => {
        setPolicy(null);
        setAnswers({});
        setRequests([]);
        const p = await api.request<MvpVerificationPolicy>(
          "/mvp/v1/verification/policy",
        );
        setPolicy(p);
        setRequests(
          await api.request<MvpVerificationRequest[]>(`${base}/verification`),
        );
      })}
      {policy && !policy.policy && (
        <Text>
          İşletme doğrulama başvurusu henüz kullanılamıyor. Profil yayınlamak
          doğrulama sağlamaz.
        </Text>
      )}
      {policy?.policy && (
        <>
          <Text>{policy.policy.notice}</Text>
          {policy.policy.fields.map((field) => (
            <View key={field.key}>
              <Text>{field.label}</Text>
              <TextInput
                placeholderTextColor={palette.muted}
                accessibilityLabel={`Doğrulama: ${field.label}`}
                value={answers[field.key] ?? ""}
                onChangeText={(value) =>
                  setAnswers((current) => ({ ...current, [field.key]: value }))
                }
                editable={!busy}
                style={styles.input}
                maxLength={1000}
              />
            </View>
          ))}
          {button("Doğrulama incelemesi iste", async () => {
            await api.request(`${base}/verification`, "POST", {
              policyVersion: policy.policy!.version,
              answers,
            });
            setAnswers({});
            setRequests(await api.request(`${base}/verification`));
            setMessage(
              "Başvurunuz incelemeye alındı. Henüz doğrulanmış değilsiniz.",
            );
          })}
        </>
      )}
      {requests.map((request) => (
        <View key={request.id}>
          <Text>
            Başvuru: {statusLabels[request.status] ?? "Durum güncellenmeli"}
          </Text>
          {request.status === "SUBMITTED" &&
            button("Bekleyen doğrulama başvurusunu iptal et", async () => {
              await api.request(
                `${base}/verification/${request.id}/cancel`,
                "POST",
              );
              setRequests(await api.request(`${base}/verification`));
            })}
          {request.reviewNote && (
            <Text>İnceleme notu: {request.reviewNote}</Text>
          )}
        </View>
      ))}
      <Text style={styles.heading}>AI eşleştirme</Text>
      <Text>
        Yayınladığınız hizmetleri arama dizinine ekleyebilir, hizmet hedeflerine
        göre benzer kayıtları arayabilirsiniz. Bu işlemler fiyat veya randevu
        değiştirmez.
      </Text>
      {button("Arama için hizmetlerimi yükle", async () => {
        setServices(await api.request(`/businesses/${businessId}/services`));
      })}
      {services.map((service) =>
        button(`${service.name} için aramayı güncelle`, async () => {
          await api.request(
            `${base}/services/${service.id}/semantic-index`,
            "POST",
            {
              idempotencyKey: `index-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            },
          );
          setMessage("Hizmetiniz arama dizinine eklenmek üzere sıraya alındı.");
        }),
      )}
      <TextInput
        placeholderTextColor={palette.muted}
        accessibilityLabel="İşletme AI eşleştirme hedefi"
        placeholder="Hizmet hedefi; kişisel müşteri bilgisi yazmayın"
        value={query}
        onChangeText={setQuery}
        editable={!busy}
        maxLength={200}
        style={styles.input}
      />
      {button("İşletme için AI eşleşmeleri bul", async () => {
        setMatches(null);
        setMatches(
          await api.request<SemanticMatches>(
            `${base}/ai-match`,
            "POST",
            { query },
            { timeoutMs: 30000 },
          ),
        );
      })}
      {matches?.status === "NO_MATCH" && (
        <Text>Güncel arama kaydı bulunamadı.</Text>
      )}
      {matches?.items.map((match) => (
        <View key={`${match.businessId}-${match.serviceId}`}>
          <Text>
            {match.businessName} · {match.serviceName}
          </Text>
          {choose &&
            button(`${match.serviceName} eşleşmesini incele`, () =>
              choose(match.businessId),
            )}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 12, marginVertical: 16 },
  heading: { fontSize: 18, fontWeight: "600", color: palette.text },
  button: { padding: 12, backgroundColor: palette.primary, borderRadius: 8 },
  white: { color: "white" },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    backgroundColor: palette.field,
    color: palette.text,
  },
});
