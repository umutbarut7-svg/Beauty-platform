/** Provider-neutral, public ORZELL result-to-booking link contract. */
export interface OrzellShareTarget {
  businessId: string;
  serviceId: string;
  professionalId?: string;
  resultId?: string;
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const requireId = (value: string | undefined, label: string): string => {
  if (!value || !ID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};

/** Only trusted HTTPS origins can be used to generate external share links. */
export function createOrzellShareLink(
  origin: string,
  target: OrzellShareTarget,
): string {
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  ) {
    throw new Error("Share origin must be a bare HTTPS origin");
  }
  const url = new URL("/discover/service", base);
  url.searchParams.set(
    "businessId",
    requireId(target.businessId, "businessId"),
  );
  url.searchParams.set("serviceId", requireId(target.serviceId, "serviceId"));
  if (target.professionalId !== undefined)
    url.searchParams.set(
      "professionalId",
      requireId(target.professionalId, "professionalId"),
    );
  if (target.resultId !== undefined)
    url.searchParams.set("resultId", requireId(target.resultId, "resultId"));
  return url.toString();
}

/** Reject foreign domains and ambiguous/malformed URLs before booking navigation. */
export function parseOrzellShareLink(
  link: string,
  trustedOrigin: string,
): OrzellShareTarget | null {
  try {
    const url = new URL(link);
    const origin = new URL(trustedOrigin);
    if (
      origin.protocol !== "https:" ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.username ||
      origin.password ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.origin !== origin.origin ||
      url.pathname !== "/discover/service"
    )
      return null;
    const allowed = new Set([
      "businessId",
      "serviceId",
      "professionalId",
      "resultId",
    ]);
    for (const key of url.searchParams.keys()) {
      if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1)
        return null;
    }
    const businessId = requireId(
      url.searchParams.get("businessId") ?? undefined,
      "businessId",
    );
    const serviceId = requireId(
      url.searchParams.get("serviceId") ?? undefined,
      "serviceId",
    );
    const professionalId = url.searchParams.get("professionalId") ?? undefined;
    const resultId = url.searchParams.get("resultId") ?? undefined;
    if (url.searchParams.has("professionalId") && !professionalId) return null;
    if (url.searchParams.has("resultId") && !resultId) return null;
    if (professionalId) requireId(professionalId, "professionalId");
    if (resultId) requireId(resultId, "resultId");
    return {
      businessId,
      serviceId,
      ...(professionalId ? { professionalId } : {}),
      ...(resultId ? { resultId } : {}),
    };
  } catch {
    return null;
  }
}
