import { ServiceUnavailableException } from "@nestjs/common";

export function configuredInteger(name: string, min: number, max: number) {
  const raw = process.env[name];
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < min || value > max)
    throw new ServiceUnavailableException("PROVIDER_CONFIGURATION_REQUIRED");
  return value;
}
export function photoPolicy() {
  if (process.env.MVP_PHOTO_POLICY_REVIEWED !== "true") return null;
  const version = process.env.MVP_PHOTO_POLICY_VERSION;
  const notice = process.env.MVP_PHOTO_NOTICE;
  if (!version || version.length > 100 || !notice || notice.length > 10000)
    return null;
  try {
    return {
      version,
      notice,
      retentionHours: configuredInteger("MVP_PHOTO_RETENTION_HOURS", 1, 720),
      auditDays: configuredInteger("MVP_PHOTO_AUDIT_RETENTION_DAYS", 1, 3650),
    };
  } catch {
    return null;
  }
}
export function aiConfigured() {
  return (
    process.env.MVP_AI_ENABLED === "true" &&
    Boolean(process.env.OPENAI_API_KEY?.trim())
  );
}
export function visionConfigured() {
  return aiConfigured() && Boolean(process.env.OPENAI_VISION_MODEL?.trim());
}
export const EMBEDDING_DIMENSIONS = 1536;
export function embeddingModel() {
  const model = process.env.OPENAI_EMBEDDING_MODEL;
  if (
    !aiConfigured() ||
    !["text-embedding-3-small", "text-embedding-3-large"].includes(model ?? "")
  )
    throw new ServiceUnavailableException("EMBEDDING_PROVIDER_UNAVAILABLE");
  return model!;
}
export function assertMvpEnabled() {
  if (process.env.STAGE33_MVP_ENABLED !== "true")
    throw new ServiceUnavailableException("MVP_FEATURE_DISABLED");
}
