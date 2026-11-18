import {
  createOrzellShareLink,
  parsePublishedShareService,
  type MvpApiClient,
  type OrzellShareTarget,
} from "@beauty-platform/types";

/** A draft is made only from the current published business/service/staff projection. */
export async function prepareServiceShare(
  api: Pick<MvpApiClient, "request">,
  origin: string,
  target: OrzellShareTarget,
) {
  if (target.resultId)
    throw new Error("Sonuç görseli paylaşımı henüz kullanılamıyor.");
  const url = createOrzellShareLink(origin, target);
  const params = new URL(url).searchParams;
  const published = parsePublishedShareService(
    await api.request<unknown>(`/discovery/shared-service?${params}`),
    target,
  );
  if (!published)
    throw new Error("Hizmetin yayındaki bilgileri doğrulanamadı.");
  return { url, published };
}
