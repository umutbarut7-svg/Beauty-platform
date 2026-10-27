import { describe, expect, it, vi } from "vitest";
import { prepareNativePhoto, type NativePhotoIO } from "../native-photo";
import { MAX_PHOTO_BYTES, MAX_SOURCE_BYTES } from "../photo-upload";

const jpeg = Uint8Array.from([255, 216, 255, 224]);
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const heic = Uint8Array.from([
  0,
  0,
  0,
  24,
  ...Array.from("ftypheic", (v) => v.charCodeAt(0)),
]);
const asset = {
  uri: "file:///picker/original.heic",
  width: 8064,
  height: 6048,
};

function fixture(
  options: {
    sourceSize?: number;
    sourceHeader?: Uint8Array;
    outputSizes?: number[];
    outputHeader?: Uint8Array;
    outputDimensions?: { width: number; height: number };
  } = {},
) {
  let attempt = 0;
  const io: NativePhotoIO = {
    inspect: vi.fn(async (uri) =>
      uri === asset.uri
        ? {
            size: options.sourceSize ?? 12 * 1024 * 1024,
            header: options.sourceHeader ?? heic,
          }
        : {
            size: options.outputSizes?.[attempt - 1] ?? 240000,
            header: options.outputHeader ?? jpeg,
          },
    ),
    encode: vi.fn(async (_source, dimensions) => ({
      uri: `file:///cache/prepared-${++attempt}.jpg`,
      ...(options.outputDimensions ?? dimensions),
    })),
    remove: vi.fn(),
  };
  return io;
}

describe("native photo preparation", () => {
  it.each([heic, jpeg, png])(
    "prepares a large phone photo before applying upload limits",
    async (header) => {
      const io = fixture({ sourceHeader: header });
      const result = await prepareNativePhoto(asset, io);
      expect(io.encode).toHaveBeenCalledWith(
        asset,
        { width: 1600, height: 1200 },
        0.85,
      );
      expect(result).toMatchObject({
        uri: "file:///cache/prepared-1.jpg",
        name: "photo.jpg",
        type: "image/jpeg",
      });
      expect(io.remove).not.toHaveBeenCalled();
      result.cleanup();
      expect(io.remove).toHaveBeenCalledExactlyOnceWith(result.uri);
      expect(io.remove).not.toHaveBeenCalledWith(asset.uri);
    },
  );

  it("uses measured output bytes and retries compression without leaking discarded files", async () => {
    const io = fixture({
      outputSizes: [MAX_PHOTO_BYTES + 1, MAX_PHOTO_BYTES + 1, MAX_PHOTO_BYTES],
    });
    const result = await prepareNativePhoto(asset, io);
    expect(io.encode).toHaveBeenCalledTimes(3);
    expect(io.remove).toHaveBeenCalledTimes(2);
    expect(result.uri).toBe("file:///cache/prepared-3.jpg");
    result.cleanup();
    expect(io.remove).toHaveBeenCalledTimes(3);
  });

  it.each([0, -1, Number.NaN, MAX_SOURCE_BYTES + 1])(
    "rejects an unreadable or oversized source before decoding: %s",
    async (sourceSize) => {
      const io = fixture({ sourceSize });
      await expect(prepareNativePhoto(asset, io)).rejects.toThrow("40 MB");
      expect(io.encode).not.toHaveBeenCalled();
      expect(io.remove).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid bytes even when the filename claims to be a photo", async () => {
    const io = fixture({
      sourceHeader: new TextEncoder().encode("not a photo"),
    });
    await expect(prepareNativePhoto(asset, io)).rejects.toThrow("HEIC");
    expect(io.encode).not.toHaveBeenCalled();
  });

  it("cleans up each failed output and rejects non-JPEG encoder output", async () => {
    const io = fixture({ outputHeader: png });
    await expect(prepareNativePhoto(asset, io)).rejects.toThrow(
      "küçültülemedi",
    );
    expect(io.remove).toHaveBeenCalledTimes(3);
    expect(io.remove).not.toHaveBeenCalledWith(asset.uri);
  });

  it("rejects an oversized decoded output rather than trusting the requested resize", async () => {
    const io = fixture({ outputDimensions: { width: 4000, height: 3000 } });
    await expect(prepareNativePhoto(asset, io)).rejects.toThrow(
      "küçültülemedi",
    );
    expect(io.remove).toHaveBeenCalledTimes(3);
  });

  it("rejects excessive source pixels before reading or decoding", async () => {
    const io = fixture();
    await expect(
      prepareNativePhoto({ ...asset, width: 10000, height: 10000 }, io),
    ).rejects.toThrow("çözünürlüğü");
    expect(io.inspect).not.toHaveBeenCalled();
  });

  it("preserves the source if the encoder unexpectedly returns the original URI", async () => {
    const io = fixture();
    vi.mocked(io.encode).mockResolvedValue(asset);
    await expect(prepareNativePhoto(asset, io)).rejects.toThrow(
      "hazırlanamadı",
    );
    expect(io.remove).not.toHaveBeenCalled();
  });

  it("cleans up a temporary output when its verification fails", async () => {
    const io = fixture();
    vi.mocked(io.inspect)
      .mockReset()
      .mockResolvedValueOnce({ size: 500000, header: heic })
      .mockRejectedValueOnce(new Error("read failed"));
    await expect(prepareNativePhoto(asset, io)).rejects.toThrow("read failed");
    expect(io.remove).toHaveBeenCalledExactlyOnceWith(
      "file:///cache/prepared-1.jpg",
    );
  });
});
