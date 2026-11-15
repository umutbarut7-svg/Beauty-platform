import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetPublicAccessBlockCommand,
  GetBucketVersioningCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export function storageConfigured() {
  return (
    process.env.MVP_S3_ENABLED === "true" &&
    Boolean(process.env.MVP_S3_BUCKET && process.env.AWS_REGION)
  );
}
@Injectable()
export class PrivatePhotoStore {
  onModuleDestroy() {
    this.clientValue?.destroy();
  }
  private clientValue?: S3Client;
  private secureUntil = 0;
  private client() {
    if (!storageConfigured())
      throw new ServiceUnavailableException("PRIVATE_STORAGE_UNAVAILABLE");
    const endpoint = process.env.MVP_S3_TEST_ENDPOINT;
    if (
      endpoint &&
      !(
        process.env.NODE_ENV === "test" &&
        /^http:\/\/127\.0\.0\.1:9000\/?$/.test(endpoint)
      )
    )
      throw new ServiceUnavailableException(
        "PRIVATE_STORAGE_CONFIGURATION_INVALID",
      );
    return (this.clientValue ??= new S3Client({
      region: process.env.AWS_REGION,
      maxAttempts: 1,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
    }));
  }
  private bucket() {
    return process.env.MVP_S3_BUCKET!;
  }
  private key(key: string) {
    if (!/^private\/mvp\/[0-9a-f-]{36}$/.test(key))
      throw new Error("InvalidPrivateObjectKey");
    return key;
  }
  async assertPrivateBucket() {
    const client = this.client();
    if (this.secureUntil > Date.now()) return;
    try {
      const versioning = await client.send(
        new GetBucketVersioningCommand({ Bucket: this.bucket() }),
      );
      // Versioned or suspended buckets require a version-aware erasure policy; do not silently retain old images.
      if (versioning.Status) throw new Error("VersionedBucketNotSupported");
      if (!process.env.MVP_S3_TEST_ENDPOINT) {
        const block = (
          await client.send(
            new GetPublicAccessBlockCommand({ Bucket: this.bucket() }),
          )
        ).PublicAccessBlockConfiguration;
        if (
          !block ||
          !block.BlockPublicAcls ||
          !block.BlockPublicPolicy ||
          !block.IgnorePublicAcls ||
          !block.RestrictPublicBuckets
        )
          throw new Error("PublicAccessBlockRequired");
      }
      this.secureUntil = Date.now() + 30000;
    } catch {
      throw new ServiceUnavailableException(
        "PRIVATE_STORAGE_SECURITY_UNVERIFIED",
      );
    }
  }
  async put(key: string, jpeg: Buffer) {
    await this.assertPrivateBucket();
    const command = new PutObjectCommand({
      Bucket: this.bucket(),
      Key: this.key(key),
      Body: jpeg,
      ContentType: "image/jpeg",
      ContentLength: jpeg.length,
      CacheControl: "no-store",
      IfNoneMatch: "*",
      ServerSideEncryption: "AES256",
    });
    try {
      await this.client().send(command);
    } catch {
      throw new ServiceUnavailableException("PRIVATE_STORAGE_UNAVAILABLE");
    }
  }
  async normalize(bytes: Buffer, mime: string) {
    try {
      if (
        !bytes.length ||
        bytes.length > MAX_PHOTO_BYTES ||
        !["image/jpeg", "image/png"].includes(mime)
      )
        throw new Error("PhotoSizeLimit");
      const image = sharp(bytes, {
        limitInputPixels: 20000000,
        animated: false,
      });
      const metadata = await image.metadata();
      if (
        (mime === "image/jpeg"
          ? metadata.format !== "jpeg"
          : metadata.format !== "png") ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error("InvalidPhotoFormat");
      return await image
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      throw new ServiceUnavailableException("PRIVATE_PHOTO_INVALID");
    }
  }
  async sanitizedJpeg(key: string, expectedBytes: number, mime: string) {
    await this.assertPrivateBucket();
    try {
      const object = await this.client().send(
        new GetObjectCommand({ Bucket: this.bucket(), Key: this.key(key) }),
      );
      if (
        object.ContentLength !== expectedBytes ||
        object.ContentLength > MAX_PHOTO_BYTES ||
        object.ContentType !== mime ||
        !object.Body
      )
        throw new Error("PhotoMetadataMismatch");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > MAX_PHOTO_BYTES) throw new Error("PhotoSizeLimit");
        chunks.push(Buffer.from(chunk));
      }
      if (size !== expectedBytes) throw new Error("PhotoSizeMismatch");
      const bytes = Buffer.concat(chunks);
      const image = sharp(bytes, {
        limitInputPixels: 20000000,
        animated: false,
      });
      const metadata = await image.metadata();
      if (
        !(["jpeg", "png"] as Array<string | undefined>).includes(
          metadata.format,
        ) ||
        (metadata.pages ?? 1) > 1 ||
        (mime === "image/jpeg"
          ? metadata.format !== "jpeg"
          : metadata.format !== "png")
      )
        throw new Error("InvalidPhotoFormat");
      // Decoding/re-encoding strips EXIF/GPS; only the bounded normalized JPEG is sent to the provider.
      return await image
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      throw new ServiceUnavailableException("PRIVATE_PHOTO_NOT_READY");
    }
  }
  async erase(key: string) {
    try {
      this.key(key);
      await this.assertPrivateBucket();
      await this.client().send(
        new DeleteObjectCommand({ Bucket: this.bucket(), Key: this.key(key) }),
      );
    } catch {
      throw new ServiceUnavailableException("PRIVATE_PHOTO_ERASURE_PENDING");
    }
  }
}
