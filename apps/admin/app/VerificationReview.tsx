"use client";
import { useState } from "react";
import type {
  MvpApiClient,
  MvpVerificationPolicy,
  MvpVerificationRequest,
} from "@beauty-platform/types";
export function VerificationReview({
  api,
  businessId,
  busy,
  run,
  reviewed,
}: {
  api: MvpApiClient;
  businessId: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  reviewed: (verified: boolean) => void;
}) {
  const [policy, setPolicy] = useState<MvpVerificationPolicy | null>(null);
  const [requests, setRequests] = useState<MvpVerificationRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const base = `/mvp/v1/businesses/${businessId}/verification`;
  async function decide(
    id: string,
    decision: "APPROVED" | "REJECTED" | "REVOKED",
  ) {
    if (!checked[id] || !notes[id]?.trim()) return;
    await api.request(`${base}/${id}/review`, "POST", {
      decision,
      note: notes[id],
    });
    setRequests(await api.request(base));
    reviewed(decision === "APPROVED");
    setChecked((current) => ({ ...current, [id]: false }));
  }
  return (
    <section aria-label="İşletme doğrulama incelemesi">
      <h3>İşletme doğrulama incelemesi</h3>
      <button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            setRequests([]);
            setPolicy(null);
            setChecked({});
            setNotes({});
            setPolicy(
              await api.request<MvpVerificationPolicy>(
                "/mvp/v1/verification/policy",
              ),
            );
            setRequests(await api.request(base));
          })
        }
      >
        Doğrulama başvurularını yükle
      </button>
      {policy && !policy.policy && (
        <p>İncelenmiş doğrulama politikası tanımlanmadan karar verilemez.</p>
      )}
      {policy?.policy && <p>{policy.policy.notice}</p>}
      {policy && !requests.length && (
        <p>İncelenecek doğrulama başvurusu yok.</p>
      )}
      {requests.map((request) => (
        <article key={request.id}>
          <h4>Başvuru · {request.status}</h4>
          <dl>
            {Object.entries(request.answers).map(([key, value]) => (
              <div key={key}>
                <dt>
                  {policy?.policy?.fields.find((f) => f.key === key)?.label ??
                    "Başvuru bilgisi"}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {request.reviewNote && <p>Önceki karar notu: {request.reviewNote}</p>}
          {policy?.policy &&
            (request.status === "APPROVED" ||
              policy.policy.version === request.policyVersion) &&
            ["SUBMITTED", "APPROVED"].includes(request.status) && (
              <>
                <label>
                  İnceleme gerekçesi
                  <textarea
                    aria-label={`İnceleme gerekçesi ${request.id}`}
                    value={notes[request.id] ?? ""}
                    disabled={busy}
                    maxLength={1000}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={checked[request.id] ?? false}
                    disabled={busy}
                    onChange={(event) =>
                      setChecked((current) => ({
                        ...current,
                        [request.id]: event.target.checked,
                      }))
                    }
                  />
                  Başvuruyu ve karar gerekçesini inceledim; bu işletmenin üyesi
                  değilim.
                </label>
                {(request.status === "SUBMITTED"
                  ? (["APPROVED", "REJECTED"] as const)
                  : (["REVOKED"] as const)
                ).map((decision) => (
                  <button
                    key={decision}
                    disabled={
                      busy || !checked[request.id] || !notes[request.id]?.trim()
                    }
                    onClick={() => void run(() => decide(request.id, decision))}
                  >
                    {decision === "APPROVED"
                      ? "İncelemeyi onayla"
                      : decision === "REJECTED"
                        ? "Başvuruyu reddet"
                        : "Doğrulamayı geri al"}
                  </button>
                ))}
              </>
            )}
        </article>
      ))}
    </section>
  );
}
