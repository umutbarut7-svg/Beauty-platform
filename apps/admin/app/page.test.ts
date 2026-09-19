import { describe, expect, it } from "vitest";
import { siteMetadata } from "./metadata";

describe("admin metadata", () => {
  it("has a descriptive title", () => {
    expect(siteMetadata.title).toBe("Beauty Platform Admin");
  });
});
