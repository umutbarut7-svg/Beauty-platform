import { describe, expect, it } from "vitest";
import { AppController } from "./app.controller.js";

describe("AppController", () => {
  it("reports API health", () => {
    expect(new AppController().getHealth()).toEqual({
      service: "api",
      status: "ok",
    });
  });
});
