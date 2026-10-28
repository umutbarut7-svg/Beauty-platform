import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFormDataPatch } from "expo/src/winter/FormData";
import { convertFormDataAsync } from "expo/src/winter/fetch/convertFormData";
import * as device from "../native-photo-expo";
import { PhotoPreparationError } from "../photo-upload";

const native = vi.hoisted(() => ({
  files: new Map<string, { bytes: Uint8Array; size: number }>(),
  opens: [] as string[],
  reads: [] as number[],
  closes: [] as string[],
  removed: [] as string[],
  failRead: false,
}));

vi.mock("expo-file-system", () => ({
  FileMode: { ReadOnly: "r" },
  File: class {
    constructor(public uri: string) {}
    get exists() {
      return native.files.has(this.uri);
    }
    get size() {
      return native.files.get(this.uri)?.size ?? 0;
    }
    get name() {
      return this.uri.split("/").at(-1)!;
    }
    get type() {
      return "image/jpeg";
    }
    bytesSync() {
      return native.files.get(this.uri)!.bytes;
    }
    async bytes() {
      return this.bytesSync();
    }
    // Match the pinned Expo implementation: RN Blob rejects this byte array.
    slice(start: number, end: number) {
      return new Blob([this.bytesSync().slice(start, end)]);
    }
    open(mode: string) {
      expect(mode).toBe("r");
      native.opens.push(this.uri);
      return {
        readBytes: (length: number) => {
          native.reads.push(length);
          if (native.failRead) throw new Error("private native path");
          return this.bytesSync().slice(0, length);
        },
        close: () => {
          native.closes.push(this.uri);
        },
      };
    }
    delete() {
      native.removed.push(this.uri);
      native.files.delete(this.uri);
    }
  },
}));

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: vi.fn(),
      renderAsync: async () => ({
        saveAsync: async () => ({
          uri: "file:///cache/prepared.jpg",
          width: 1600,
          height: 1200,
        }),
        release: vi.fn(),
      }),
      release: vi.fn(),
    }),
  },
}));

class NativeBlob {
  constructor(parts: unknown[]) {
    if (
      parts.some(
        (part) => ArrayBuffer.isView(part) || part instanceof ArrayBuffer,
      )
    )
      throw new Error(
        "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported",
      );
  }
}

beforeEach(() => {
  native.files.clear();
  native.opens.length =
    native.reads.length =
    native.closes.length =
    native.removed.length =
      0;
  native.failRead = false;
  native.files.set("file:///picker/original.heic", {
    bytes: Uint8Array.from([
      0,
      0,
      0,
      24,
      ...Array.from("ftypheic", (c) => c.charCodeAt(0)),
    ]),
    size: 12 * 1024 * 1024,
  });
  native.files.set("file:///cache/prepared.jpg", {
    bytes: Uint8Array.from([255, 216, 255, 224, 0, 8, 74, 70, 73, 70]),
    size: 10,
  });
  vi.stubGlobal("Blob", NativeBlob);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pinned Expo native photo adapter", () => {
  it("prepares a photo when native Blob cannot accept byte arrays", async () => {
    const photo = await device.prepareDevicePhoto({
      uri: "file:///picker/original.heic",
      width: 8064,
      height: 6048,
    });
    expect(photo.uri).toBe("file:///cache/prepared.jpg");
    expect(native.reads).toEqual([64, 10]);
    expect(native.closes).toEqual(native.opens);
    photo.cleanup();
    expect(native.removed).toEqual([photo.uri]);
    expect(native.files.has("file:///picker/original.heic")).toBe(true);
  });

  it("closes the file and reports a photo read error without exposing its path", async () => {
    native.failRead = true;
    const result = device.prepareDevicePhoto({
      uri: "file:///picker/original.heic",
      width: 400,
      height: 300,
    });
    await expect(result).rejects.toBeInstanceOf(PhotoPreparationError);
    await expect(result).rejects.toThrow("Fotoğraf okunamadı");
    expect(native.closes).toEqual(native.opens);
    expect(native.removed).toEqual([]);
  });

  it("sends actual JPEG bytes through the installed Expo multipart converter", async () => {
    class NativeFormData {
      _parts: unknown[] = [];
    }
    const Form = installFormDataPatch(
      NativeFormData as unknown as typeof FormData,
    );
    const form = new Form();
    device.appendDevicePhoto(form as unknown as FormData, {
      uri: "file:///cache/prepared.jpg",
    });
    const result = await convertFormDataAsync(
      form as unknown as FormData,
      "synthetic-boundary",
    );
    const bytes = Array.from(result.body);
    const text = new TextDecoder().decode(result.body);
    expect(text).toContain('name="photo"; filename="prepared.jpg"');
    expect(text).toContain("content-type: image/jpeg");
    expect(text).not.toContain("file://");
    expect(
      bytes.some(
        (byte, i) =>
          byte === 255 && bytes[i + 1] === 216 && bytes[i + 2] === 255,
      ),
    ).toBe(true);
  });

  it("reproduces the old URI-only upload rejection with the installed Expo converter", async () => {
    class NativeFormData {
      _parts: unknown[] = [];
    }
    const Form = installFormDataPatch(
      NativeFormData as unknown as typeof FormData,
    );
    const form = new Form();
    form.append("photo", {
      uri: "file:///cache/prepared.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
    });
    await expect(
      convertFormDataAsync(form as unknown as FormData),
    ).rejects.toThrow("Unsupported FormDataPart implementation");
  });
});
