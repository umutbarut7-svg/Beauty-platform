/* Explicit live adapter acceptance. No DB, real-user data or rollout changes. */
"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
require("reflect-metadata");
const sharp = require("sharp");
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const {
  PrivatePhotoStore,
} = require("./dist/mvp/providers/private-photo-store.js");
const {
  OpenAiBeautyProvider,
} = require("./dist/mvp/providers/openai-beauty.provider.js");
const { MetricsService } = require("./dist/infrastructure/metrics.service.js");

async function main() {
  assert.equal(process.env.STAGE33_LIVE_ADAPTER_TEST, "confirmed");
  assert.equal(process.env.MVP_S3_BUCKET, "beautyplatform-private-photos-dev");
  assert.equal(process.env.AWS_REGION, "eu-north-1");
  assert.equal(process.env.OPENAI_VISION_MODEL, "gpt-5.4-mini");
  assert.equal(process.env.OPENAI_EMBEDDING_MODEL, "text-embedding-3-small");
  assert.ok(process.env.OPENAI_API_KEY?.trim());
  assert.ok(!process.env.MVP_S3_TEST_ENDPOINT);
  const store = new PrivatePhotoStore();
  const s3 = new S3Client({
    region: "eu-north-1",
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
  });
  const provider = new OpenAiBeautyProvider(new MetricsService());
  const key = `private/mvp/f33f33f3-${randomUUID().slice(9)}`;
  const bucket = process.env.MVP_S3_BUCKET;
  let attempted = false;
  let stage = "configuration";
  try {
    stage = "private-bucket-security";
    await store.assertPrivateBucket();
    stage = "synthetic-image-normalization";
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#808080" },
    })
      .withExif({ IFD0: { Copyright: "Synthetic adapter fixture" } })
      .png()
      .toBuffer();
    const jpeg = await store.normalize(png, "image/png");
    const metadata = await sharp(jpeg).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.exif, undefined);
    const before = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: key }),
    );
    assert.equal(before.KeyCount, 0);
    stage = "private-upload-and-read";
    attempted = true;
    await store.put(key, jpeg);
    const object = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    try {
      assert.equal(object.ServerSideEncryption, "AES256");
      assert.equal(object.ContentType, "image/jpeg");
    } finally {
      object.Body?.destroy();
    }
    await assert.rejects(store.put(key, jpeg));
    const anonymous = await fetch(
      `https://${bucket}.s3.eu-north-1.amazonaws.com/${key}`,
      { redirect: "error", signal: AbortSignal.timeout(15000) },
    );
    try {
      assert.equal(anonymous.status, 403);
    } finally {
      await anonymous.body?.cancel();
    }
    const sanitized = await store.sanitizedJpeg(key, jpeg.length, "image/jpeg");
    assert.equal((await sharp(sanitized).metadata()).exif, undefined);
    console.log("PASS: real private encrypted S3 upload/read and EXIF removal");
    stage = "live-embedding-adapter";
    const embedding = await provider.embed(
      "Profesyonel sac kesimi ve renklendirme",
    );
    assert.equal(embedding.vector.length, 1536);
    console.log("PASS: application OpenAI embedding adapter (1536 dimensions)");
    stage = "live-vision-adapter";
    const analysis = await provider.analyze({
      jpeg: sanitized,
      intent: "sac danismanligi",
      target: "uygun bakim",
      answers: [],
    });
    assert.equal(analysis.plan.status, "NEEDS_INFORMATION");
    assert.ok(analysis.plan.questions.length > 0);
    console.log(
      "PASS: application vision adapter accepts image and validates structured response",
    );
  } catch {
    // Never print upstream payloads, object keys, credentials or stack traces.
    console.error(`FAIL: ${stage}`);
    process.exitCode = 1;
  } finally {
    if (attempted) {
      try {
        await store.erase(key);
        const after = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: key }),
        );
        assert.equal(after.KeyCount, 0);
        console.log(
          "PASS: synthetic S3 object physically erased and absence verified",
        );
      } catch {
        console.error("FAIL: synthetic object cleanup requires review");
        process.exitCode = 1;
      }
    }
    store.onModuleDestroy();
    s3.destroy();
  }
}
main().catch(() => {
  console.error("FAIL: configuration");
  process.exitCode = 1;
});
