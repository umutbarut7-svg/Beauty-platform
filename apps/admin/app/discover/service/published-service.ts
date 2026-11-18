import {
  parsePublishedShareService,
  type OrzellShareTarget,
} from "@beauty-platform/types";

export function publicApiBase(apiOrigin: string | undefined, pathPrefix = "") {
  if (!apiOrigin || !["", "/api"].includes(pathPrefix)) return null;
  try {
    const base = new URL(apiOrigin);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/"
    )
      return null;
    return `${base.origin}${pathPrefix}`;
  } catch {
    return null;
  }
}

export async function resolvePublishedService(
  target: OrzellShareTarget,
  apiOrigin: string | undefined,
  transport: typeof fetch = fetch,
  pathPrefix = "",
) {
  if (!apiOrigin || target.resultId) return null;
  try {
    const base = publicApiBase(apiOrigin, pathPrefix);
    if (!base) return null;
    const url = new URL(`${base}/discovery/shared-service`);
    url.searchParams.set("businessId", target.businessId);
    url.searchParams.set("serviceId", target.serviceId);
    if (target.professionalId)
      url.searchParams.set("professionalId", target.professionalId);
    const response = await transport(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return parsePublishedShareService(await response.json(), target);
  } catch {
    return null;
  }
}
