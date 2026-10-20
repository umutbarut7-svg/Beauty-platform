export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(
      status === 401
        ? "Oturum süresi doldu. Yeniden giriş yapın."
        : status === 403
          ? "Bu işlem için yetkiniz yok."
          : status === 409
            ? "Kayıt değişti veya bu işlem daha önce tamamlandı. Yenileyin."
            : status === 503
              ? "Bu özellik şu anda kullanılamıyor."
              : "İşlem tamamlanamadı. Bilgileri kontrol edip yeniden deneyin.",
    );
  }
}

/** Memory-only session. No token, payload or provider URL is logged or persisted. */
export class MvpApiClient {
  private accessToken = "";
  private refreshToken = "";
  private generation = 0;
  readonly baseUrl: string;
  constructor(
    baseUrl: string,
    private readonly transport: typeof fetch = (...args) =>
      globalThis.fetch(...args),
  ) {
    const url = new URL(baseUrl);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(url.hostname)
        ))
    )
      throw new Error("API bağlantısı HTTPS kullanmalıdır.");
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  clear() {
    this.accessToken = "";
    this.refreshToken = "";
    this.generation++;
  }
  async signIn(mode: "login" | "register", email: string, password: string) {
    this.clear();
    const generation = this.generation;
    const result = await this.request<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; role: string };
    }>(`/auth/${mode}`, "POST", { email, password });
    if (generation !== this.generation) throw new Error("Oturum değişti.");
    this.accessToken = result.accessToken;
    this.refreshToken = result.refreshToken;
    return result.user;
  }
  async logout() {
    const refreshToken = this.refreshToken;
    this.clear();
    if (refreshToken)
      await this.request("/auth/logout", "POST", { refreshToken });
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path))
      throw new Error("Invalid API path");
    const generation = this.generation;
    const response = await this.transport(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(this.accessToken
          ? { authorization: `Bearer ${this.accessToken}` }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    if (generation !== this.generation) throw new Error("Oturum değişti.");
    if (!response.ok) {
      if (response.status === 401) this.clear();
      throw new ApiError(response.status);
    }
    if (response.status === 204) return undefined as T;
    const result = (await response.json()) as T;
    // A logout or another request's 401 may occur while the body is streaming.
    if (generation !== this.generation) throw new Error("Oturum değişti.");
    return result;
  }
}

export interface MvpCatalog {
  id: string;
  name: string;
  isVerified: boolean;
  services: Array<{
    id: string;
    name: string;
    price: string;
    currency: string;
    durationMinutes: number;
  }>;
  locations: Array<{ id: string; name: string }>;
  staff: Array<{
    id: string;
    displayName: string;
    services: Array<{ serviceId: string }>;
  }>;
}
export interface MvpBooking {
  id: string;
  businessId: string;
  status: string;
  startsAt: string;
  price: string;
  currency: string;
  service: { name: string };
}
export interface MvpResult {
  id: string;
  appointmentId: string;
  businessId: string;
  summary: string;
  createdAt: string;
  satisfaction: { outcome: string } | null;
}
export const CUSTOMER_MVP_STEPS = [
  "Register",
  "AI Intent",
  "Current Photo",
  "Target",
  "Smart Questions",
  "AI Analysis",
  "Result Plan",
  "AI Match",
  "Professional",
  "Booking",
  "Beauty Job",
  "Result",
  "Satisfaction",
  "Beauty Passport",
] as const;
export const BUSINESS_MVP_STEPS = [
  "Register",
  "Verification",
  "Profile",
  "Professionals",
  "Services",
  "Pricing",
  "Availability",
  "Demand",
  "AI Match",
  "Booking",
  "Beauty Job",
  "Result",
  "Revenue",
] as const;
