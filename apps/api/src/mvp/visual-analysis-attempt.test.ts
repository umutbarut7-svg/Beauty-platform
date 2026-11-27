import { HttpException } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";
import { VisualService } from "./visual.service.js";

afterEach(() => vi.unstubAllEnvs());

it.each(["quota", "provider"])(
  "handles a %s rejection on the final follow-up attempt",
  async (stage) => {
    for (const [key, value] of Object.entries({
      STAGE33_MVP_ENABLED: "true",
      MVP_PHOTO_POLICY_REVIEWED: "true",
      MVP_PHOTO_POLICY_VERSION: "test",
      MVP_PHOTO_NOTICE: "test",
      MVP_PHOTO_RETENTION_HOURS: "1",
      MVP_PHOTO_AUDIT_RETENTION_DAYS: "1",
      MVP_S3_ENABLED: "true",
      MVP_S3_BUCKET: "test",
      AWS_REGION: "us-east-1",
      MVP_AI_ENABLED: "true",
      OPENAI_API_KEY: "test",
      OPENAI_VISION_MODEL: "fixture",
    }))
      vi.stubEnv(key, value);
    const row = {
      status: "NEEDS_INFORMATION",
      attempts: 2,
      photoId: "photo",
      answers: [],
      output: { questions: ["Hedefiniz nedir?"] },
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      mvpPhotoAnalysis: {
        findFirst: vi.fn().mockResolvedValue(row),
        updateMany,
      },
      mvpPhoto: { findFirst: vi.fn().mockResolvedValue({}) },
    };
    const rejection = new HttpException("AI_USAGE_LIMIT_REACHED", 429);
    const consume =
      stage === "quota"
        ? vi.fn().mockRejectedValue(rejection)
        : vi.fn().mockResolvedValue(undefined);
    const analyze = vi.fn().mockRejectedValue(rejection);
    const service = new VisualService(
      db as never,
      {
        sanitizedJpeg: vi.fn().mockResolvedValue(Buffer.from("fixture")),
      } as never,
      { analyze } as never,
      { consume } as never,
      {} as never,
    );
    await expect(
      service.analyze(
        { id: "u", role: "CUSTOMER", email: "u@example.test" },
        "session",
        ["Bakım"],
        2,
      ),
    ).rejects.toBe(rejection);
    expect(analyze).toHaveBeenCalledTimes(stage === "quota" ? 0 : 1);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: "session", ownerId: "u", status: "RUNNING", attempts: 3 },
      data:
        stage === "quota"
          ? { status: "NEEDS_INFORMATION", attempts: 2 }
          : { status: "FAILED" },
    });
  },
);
