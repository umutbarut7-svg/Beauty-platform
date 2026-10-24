/* Fixed synthetic S3 namespace only; no AI, database or public rollout. */
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

async function main() {
  assert.equal(process.env.STAGE33_LIVE_STORAGE_TEST, "confirmed");
  assert.equal(process.env.MVP_S3_BUCKET, "beautyplatform-private-photos-dev");
  assert.equal(process.env.AWS_REGION, "eu-north-1");
  assert.ok(!process.env.MVP_S3_TEST_ENDPOINT);
  assert.ok(!process.env.OPENAI_API_KEY);
  const key = `private/mvp/f33f33f3-${randomUUID().slice(9)}`;
  const bucket = process.env.MVP_S3_BUCKET;
  const s3 = new S3Client({
    region: "eu-north-1",
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
  });
  let store = new PrivatePhotoStore();
  let attempted = false;
  let stage = "private-bucket-security";
  const absent = async () => {
    const result = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: key }),
    );
    assert.equal(result.KeyCount, 0);
  };
  const verifyRead = async () => {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    assert.equal(object.ServerSideEncryption, "AES256");
    assert.deepEqual(
      Buffer.from(await object.Body.transformToByteArray()),
      jpeg,
    );
    const metadata = await sharp(
      await store.sanitizedJpeg(key, jpeg.length, "image/jpeg"),
    ).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 64);
    assert.equal(metadata.height, 64);
  };
  let jpeg;
  try {
    await store.assertPrivateBucket();
    await absent();
    const png = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: "#808080",
      },
    })
      .png()
      .toBuffer();
    jpeg = await store.normalize(png, "image/png");
    stage = "synthetic-upload";
    attempted = true;
    await store.put(key, jpeg);
    await verifyRead();
    console.log("PASS: live private synthetic upload and application read");
    stage = "fresh-storage-client-read";
    store.onModuleDestroy();
    store = new PrivatePhotoStore();
    await store.assertPrivateBucket();
    await verifyRead();
    console.log(
      "PASS: fresh application storage client reads persisted synthetic object",
    );
    stage = "erase-and-replay";
    await store.erase(key);
    await absent();
    await store.erase(key);
    await absent();
    await assert.rejects(store.sanitizedJpeg(key, jpeg.length, "image/jpeg"));
    console.log(
      "PASS: live erasure replay, physical absence and denied subsequent read",
    );
    stage = "fresh-client-erasure-observation";
    store.onModuleDestroy();
    store = new PrivatePhotoStore();
    await store.assertPrivateBucket();
    for (let i = 0; i < 3; i++) {
      await absent();
      await assert.rejects(store.sanitizedJpeg(key, jpeg.length, "image/jpeg"));
    }
    console.log(
      "PASS: deletion remains absent across fresh client and repeated checks",
    );
  } catch {
    console.error("FAIL: " + stage);
    process.exitCode = 1;
  } finally {
    if (attempted) {
      try {
        await store.erase(key);
        await absent();
        console.log("PASS: final synthetic cleanup");
      } catch {
        console.error("FAIL: synthetic cleanup requires review");
        process.exitCode = 1;
      }
    }
    store.onModuleDestroy();
    s3.destroy();
  }
}
main().catch(() => {
  console.error("FAIL: fixed configuration");
  process.exitCode = 1;
});
