import { describe, expect, it } from "vitest";
import { createHealthStatus } from "./index.js";

describe("createHealthStatus", () => {
  it("creates an ok status for a service", () => {
    expect(createHealthStatus("api")).toEqual({ service: "api", status: "ok" });
  });
});
