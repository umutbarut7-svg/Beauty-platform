const secret =
  /^(authorization|cookie|password|token|secret|credential|api[-_]?key|systemprompt|prompt)$/i;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phone = /(?<!\d)(?:\+?\d[\s().-]?){10,15}(?!\d)/g;
export function redactAI(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (typeof value === "string")
    return value
      .replace(email, "[EMAIL_REDACTED]")
      .replace(phone, "[PHONE_REDACTED]")
      .slice(0, 1000);
  if (value === null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value))
    return value.slice(0, 20).map((v) => redactAI(v, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 100);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([k, v]) => [
        k,
        secret.test(k) ? "[REDACTED]" : redactAI(v, depth + 1),
      ]),
  );
}
