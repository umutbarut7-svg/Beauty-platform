import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
} from "@aws-sdk/client-s3";
import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivatePhotoStore } from "./private-photo-store.js";

describe("private-object erasure confirmation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  function fixture(head: () => Promise<unknown>) {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MVP_S3_ENABLED", "true");
    vi.stubEnv("MVP_S3_BUCKET", "stage33-private-fixtures");
    vi.stubEnv("AWS_REGION", "us-east-1");
    vi.stubEnv("MVP_S3_TEST_ENDPOINT", "http://127.0.0.1:9000");
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockImplementation((async (command: unknown) => {
        if (
          command instanceof GetBucketVersioningCommand ||
          command instanceof DeleteObjectCommand
        )
          return {};
        if (command instanceof HeadObjectCommand) return head();
        throw new Error("Unexpected storage command");
      }) as never);
    return {
      send,
      store: new PrivatePhotoStore(),
      key: "private/mvp/00000000-0000-4000-8000-000000000001",
    };
  }
  it("confirms deletion only when storage returns 404 for that exact object", async () => {
    const { send, store, key } = fixture(async () => {
      throw { $metadata: { httpStatusCode: 404 } };
    });
    try {
      await expect(store.erase(key)).resolves.toBeUndefined();
      const heads = send.mock.calls.filter(
        ([command]) => command instanceof HeadObjectCommand,
      );
      expect(heads).toHaveLength(1);
      expect((heads[0]![0] as HeadObjectCommand).input.Key).toBe(key);
    } finally {
      store.onModuleDestroy();
    }
  });
  it.each([
    ["still present", async () => ({ ContentLength: 100 })],
    [
      "access denied",
      async () => {
        throw { $metadata: { httpStatusCode: 403 } };
      },
    ],
    [
      "storage timeout",
      async () => {
        throw new Error("RequestTimeout");
      },
    ],
  ])("does not report erasure when %s", async (_label, head) => {
    const { store, key } = fixture(head);
    try {
      await expect(store.erase(key)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      store.onModuleDestroy();
    }
  });
});
