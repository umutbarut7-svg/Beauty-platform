/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ApiCredentialService } from "./api-credential.service.js";
const hash = (x: string) => createHash("sha256").update(x).digest("hex");
function setup(overrides: any = {}) {
  const credential = {
    id: "credential",
    keyId: "pk_test",
    secretHash: hash("secret"),
    revokedAt: null,
    expiresAt: null,
    client: {
      id: "client",
      status: "ACTIVE",
      application: {
        id: "app",
        businessId: "tenant-a",
        createdBy: "owner",
        status: "ACTIVE",
        grants: [{ scope: "business.read" }],
      },
    },
    ...overrides,
  };
  const db: any = {
    apiCredential: {
      findUnique: vi.fn().mockResolvedValue(credential),
      update: vi.fn(),
    },
    apiClient: { findFirst: vi.fn().mockResolvedValue({ id: "client" }) },
  };
  return { db, service: new ApiCredentialService(db) };
}
describe("ApiCredentialService", () => {
  it("authenticates a valid credential and derives tenant server-side", async () => {
    const { s } = { s: setup().service };
    await expect(s.authenticate("pk_test.secret")).resolves.toMatchObject({
      businessId: "tenant-a",
      scopes: ["business.read"],
    });
  });
  it("rejects invalid, revoked, and expired credentials", async () => {
    await expect(setup().service.authenticate("pk_test.wrong")).rejects.toThrow(
      "Invalid",
    );
    await expect(
      setup({ revokedAt: new Date() }).service.authenticate("pk_test.secret"),
    ).rejects.toThrow("inactive");
    await expect(
      setup({ expiresAt: new Date(0) }).service.authenticate("pk_test.secret"),
    ).rejects.toThrow("inactive");
  });
  it("fails closed for missing and unknown scopes", async () => {
    const service = setup().service;
    expect(() =>
      service.assertScope(
        {
          applicationId: "a",
          clientId: "c",
          credentialId: "k",
          businessId: "b",
          userId: "u",
          scopes: [],
        },
        "booking.write",
      ),
    ).toThrow("Insufficient");
    await expect(
      setup({
        client: {
          id: "client",
          status: "ACTIVE",
          application: {
            id: "app",
            businessId: "b",
            createdBy: "u",
            status: "ACTIVE",
            grants: [{ scope: "root.superuser" }],
          },
        },
      }).service.authenticate("pk_test.secret"),
    ).rejects.toThrow("Unknown scope");
  });
  it("returns a raw secret once while storing only its hash and fingerprint", async () => {
    const { db, service } = setup();
    db.apiCredential.create = vi.fn(async ({ data }: any) => ({
      id: "new",
      fingerprint: data.fingerprint,
      expiresAt: null,
    }));
    const issued = await service.issue("client");
    expect(issued.apiKey).toMatch(/^pk_[^.]+\.[A-Za-z0-9_-]+$/);
    const persisted = db.apiCredential.create.mock.calls[0][0].data;
    expect(persisted).not.toHaveProperty("secret");
    expect(persisted).not.toHaveProperty("apiKey");
    expect(persisted.secretHash).toHaveLength(64);
  });
});
