const sensitiveKey =
  /^(authorization|cookie|set-cookie|password|passwordhash|token|accesstoken|refreshtoken|secret|secretreference|email|phone|recipient|body)$/i;

export function sanitizeTelemetry(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (value === null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitizeTelemetry(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 100);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([key, item]) => [
        key,
        sensitiveKey.test(key)
          ? "[REDACTED]"
          : sanitizeTelemetry(item, depth + 1),
      ]),
  );
}
