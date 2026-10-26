"use client";
import { useState } from "react";
import type { MvpApiClient } from "@beauty-platform/types";
type Item = {
  id: string;
  requestedAt: string;
  processingAt: string | null;
  user: { id: string; email: string } | null;
};
type Inspection = { status: string; blockers: string[]; pendingPhotos: number };
export function AccountDeletionQueue({
  api,
  busy,
  run,
}: {
  api: MvpApiClient;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [confirmation, setConfirmation] = useState("");
  async function load(after?: string) {
    const value = await api.request<{
      items: Item[];
      nextCursor: string | null;
    }>(
      `/auth/account-deletion/pending${after ? `?after=${encodeURIComponent(after)}` : ""}`,
    );
    setItems(value.items);
    setCursor(value.nextCursor);
    setSelected(null);
    setInspection(null);
    setConfirmation("");
  }
  return (
    <section aria-label="Hesap silme kuyruğu">
      <h2>Hesap silme kuyruğu</h2>
      <button disabled={busy} onClick={() => void run(() => load())}>
        Silme taleplerini yükle
      </button>
      {items.map((item) => (
        <button
          key={item.id}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setSelected(item.id);
              setInspection(null);
              setConfirmation("");
              setInspection(
                await api.request<Inspection>(
                  `/auth/account-deletion/${item.id}/inspection`,
                ),
              );
            })
          }
        >
          {item.user?.email ?? "Hesap bağlantısı yok"} ·{" "}
          {item.processingAt ? "İşleniyor" : "Talep alındı"}
        </button>
      ))}
      {cursor && (
        <button disabled={busy} onClick={() => void run(() => load(cursor))}>
          Sonraki silme talepleri
        </button>
      )}
      {selected && inspection && (
        <div>
          <h3>Silme talebi incelemesi</h3>
          <p>
            Durum: {inspection.status} · Silinmesi beklenen fotoğraf:{" "}
            {inspection.pendingPhotos}
          </p>
          {inspection.blockers.length > 0 ? (
            <>
              <p>Saklama/üyelik incelemesi gereken kayıt sınıfları:</p>
              <ul>
                {inspection.blockers.map((model) => (
                  <li key={model}>{model}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Bu incelemede ek veri sınıfı engeli bulunmadı.</p>
          )}
          <label>
            Silme işlemi onayı
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
            />
          </label>
          {inspection.status === "REQUESTED" && (
            <button
              disabled={busy || confirmation !== "ISLEME AL"}
              onClick={() =>
                void run(async () => {
                  try {
                    await api.request(
                      `/auth/account-deletion/${selected}/begin`,
                      "POST",
                      { confirmation },
                    );
                    setInspection(
                      await api.request<Inspection>(
                        `/auth/account-deletion/${selected}/inspection`,
                      ),
                    );
                  } finally {
                    setConfirmation("");
                  }
                })
              }
            >
              Silme işlemini başlat
            </button>
          )}
          {inspection.status === "PROCESSING" && (
            <button
              disabled={
                busy ||
                confirmation !== "KALICI SIL" ||
                inspection.pendingPhotos > 0 ||
                inspection.blockers.length > 0
              }
              onClick={() =>
                void run(async () => {
                  try {
                    await api.request(
                      `/auth/account-deletion/${selected}/finalize`,
                      "POST",
                      { confirmation },
                    );
                    setInspection(
                      await api.request<Inspection>(
                        `/auth/account-deletion/${selected}/inspection`,
                      ),
                    );
                  } finally {
                    setConfirmation("");
                  }
                })
              }
            >
              Kalıcı hesap silmeyi tamamla
            </button>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setInspection(null);
                setInspection(
                  await api.request<Inspection>(
                    `/auth/account-deletion/${selected}/inspection`,
                  ),
                );
              })
            }
          >
            Silme incelemesini yenile
          </button>
        </div>
      )}
    </section>
  );
}
