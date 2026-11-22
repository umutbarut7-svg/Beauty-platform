import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MetricsService } from "../../infrastructure/metrics.service.js";
import {
  OpenAiBeautyProvider,
  validateEmbedding,
  validateVisualPlan,
} from "./openai-beauty.provider.js";
import { photoPolicy } from "./provider-config.js";
import { PrivatePhotoStore } from "./private-photo-store.js";
import { verificationPolicy } from "../verification.service.js";
afterEach(() => vi.unstubAllEnvs());
const plan = {
  status: "PLAN",
  observations: ["Görünür saç"],
  questions: [],
  steps: ["Profesyonel görüşmesi"],
  searchQuery: "saç bakımı",
  limitations: ["Yerinde değerlendirme gerekir"],
};
function configured() {
  vi.stubEnv("MVP_AI_ENABLED", "true");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-unit-key");
  vi.stubEnv("OPENAI_VISION_MODEL", "synthetic-unit-model");
  vi.stubEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small");
}
describe("external provider contracts (transport doubles only; no live OpenAI evidence)", () => {
  it("makes no request while disabled", async () => {
    vi.stubEnv("MVP_AI_ENABLED", "false");
    const transport = vi.fn();
    const provider = new OpenAiBeautyProvider(new MetricsService(), transport);
    await expect(provider.embed("hair")).rejects.toThrow("UNAVAILABLE");
    expect(transport).not.toHaveBeenCalled();
  });
  it("uses structured Responses with nonstored bounded image input and no tools", async () => {
    configured();
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          model: "synthetic-unit-model",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(plan) }],
            },
          ],
        }),
      ),
    );
    const provider = new OpenAiBeautyProvider(new MetricsService(), transport);
    const result = await provider.analyze({
      jpeg: Buffer.from("synthetic-image-contract-only"),
      intent: "saç bakımı",
      target: "parlaklık",
      answers: [],
    });
    expect(result.plan).toEqual(plan);
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
    expect(body.input[0].content[1]).toMatchObject({
      type: "input_image",
      detail: "low",
    });
    expect(options.redirect).toBe("error");
  });
  it.each([
    { status: "incomplete", output: [] },
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "private upstream refusal" }],
        },
      ],
    },
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({ ...plan, inventedField: true }),
            },
          ],
        },
      ],
    },
  ])("rejects incomplete, refused and invalid plans", async (response) => {
    configured();
    const provider = new OpenAiBeautyProvider(
      new MetricsService(),
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response))),
    );
    await expect(
      provider.analyze({
        jpeg: Buffer.from("fixture"),
        intent: "hair",
        target: "care",
        answers: [],
      }),
    ).rejects.toThrow(/VISUAL_/);
  });
  it("never exposes upstream errors or retries billable requests", async () => {
    configured();
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response('{"private":"upstream-secret"}', { status: 429 }),
      );
    const provider = new OpenAiBeautyProvider(new MetricsService(), transport);
    await expect(provider.embed("hair")).rejects.toThrow(
      "AI_PROVIDER_UNAVAILABLE",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("validates embedding model, shape, finite values and nonzero norm", async () => {
    configured();
    const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "text-embedding-3-small",
          data: [{ embedding: vector }],
        }),
      ),
    );
    expect(
      (
        await new OpenAiBeautyProvider(new MetricsService(), transport).embed(
          "hair",
        )
      ).vector,
    ).toEqual(vector);
    expect(() => validateEmbedding([1, 2])).toThrow();
    expect(() => validateEmbedding(Array(1536).fill(0))).toThrow();
    expect(() => validateEmbedding([NaN, ...vector.slice(1)])).toThrow();
    expect(() =>
      validateVisualPlan({ ...plan, status: "NEEDS_INFORMATION" }),
    ).toThrow();
  });
});
describe("reviewed policy and private photo boundaries", () => {
  it("does not infer policy approval from having provider keys", () => {
    configured();
    vi.stubEnv("MVP_PHOTO_POLICY_REVIEWED", "false");
    expect(photoPolicy()).toBeNull();
    expect(verificationPolicy()).toBeNull();
    vi.stubEnv("MVP_PHOTO_POLICY_REVIEWED", "true");
    vi.stubEnv("MVP_PHOTO_POLICY_VERSION", "unit-fixture");
    vi.stubEnv("MVP_PHOTO_NOTICE", "synthetic test notice");
    vi.stubEnv("MVP_PHOTO_RETENTION_HOURS", "NaN");
    expect(photoPolicy()).toBeNull();
    vi.stubEnv("MVP_PHOTO_RETENTION_HOURS", "24");
    vi.stubEnv("MVP_PHOTO_AUDIT_RETENTION_DAYS", "90");
    expect(photoPolicy()?.retentionHours).toBe(24);
  });
  it("decodes only bounded JPEG/PNG and strips metadata before storage/provider transfer", async () => {
    const store = new PrivatePhotoStore();
    const source = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#777777" },
    })
      .withMetadata()
      .jpeg()
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const normalized = await store.normalize(source, "image/jpeg");
    const metadata = await sharp(normalized).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
    await expect(
      store.normalize(Buffer.from("not an image"), "image/jpeg"),
    ).rejects.toThrow("INVALID");
    await expect(store.normalize(source, "image/png")).rejects.toThrow(
      "INVALID",
    );
    await expect(
      store.normalize(Buffer.alloc(5 * 1024 * 1024 + 1), "image/jpeg"),
    ).rejects.toThrow("INVALID");
  });
  it("rejects nonlocal test endpoints and arbitrary keys", async () => {
    vi.stubEnv("MVP_S3_ENABLED", "true");
    vi.stubEnv("MVP_S3_BUCKET", "fixture");
    vi.stubEnv("AWS_REGION", "us-east-1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MVP_S3_TEST_ENDPOINT", "http://127.0.0.1:9000");
    await expect(
      new PrivatePhotoStore().erase("../../other-tenant"),
    ).rejects.toThrow("PENDING");
  });
});
