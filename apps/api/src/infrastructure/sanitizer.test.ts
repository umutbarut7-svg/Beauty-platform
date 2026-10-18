import { describe, expect, it } from "vitest";
import { sanitizeTelemetry } from "./sanitizer.js";

describe("sanitizeTelemetry", () => {
  it("redacts credentials and personal communication fields recursively", () => {
    const output = sanitizeTelemetry({
      authorization: "Bearer secret",
      nested: {
        password: "secret",
        token: "secret",
        email: "person@example.com",
        safe: "operation",
      },
    });
    expect(output).toEqual({
      authorization: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
        token: "[REDACTED]",
        email: "[REDACTED]",
        safe: "operation",
      },
    });
    expect(JSON.stringify(output)).not.toContain("person@example.com");
  });
});
