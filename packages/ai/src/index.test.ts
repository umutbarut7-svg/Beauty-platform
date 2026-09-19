import { describe, expect, it } from "vitest";
import type { AiRequest } from "./index.js";

describe("AI contracts", () => {
  it("remain provider neutral", () => {
    const request: AiRequest = { prompt: "hello" };
    expect(request.prompt).toBe("hello");
  });
});
