import {
  MAX_PHOTO_BYTES,
  MAX_SOURCE_BYTES,
  PhotoPreparationError,
  photoDimensions,
  photoEncoding,
} from "./photo-upload";

export type NativePhotoAsset = {
  uri: string;
  width: number;
  height: number;
};

export type NativePhotoIO = {
  inspect: (uri: string) => Promise<{ size: number; header: Uint8Array }>;
  encode: (
    asset: NativePhotoAsset,
    size: { width: number; height: number },
    quality: number,
  ) => Promise<NativePhotoAsset>;
  remove: (uri: string) => void;
};

// Validate the actual local files, not the picker's optional MIME/size hints.
// Preparation finishes before any existing consent/session is replaced.
export async function prepareNativePhoto(
  asset: NativePhotoAsset,
  io: NativePhotoIO,
) {
  const size = photoDimensions(asset.width, asset.height);
  const source = await io.inspect(asset.uri);
  if (
    !Number.isSafeInteger(source.size) ||
    source.size <= 0 ||
    source.size > MAX_SOURCE_BYTES
  )
    throw new PhotoPreparationError(
      "Seçilen fotoğraf boş veya 40 MB sınırını aşıyor. Daha küçük bir fotoğraf seçin.",
    );
  if (!photoEncoding(source.header))
    throw new PhotoPreparationError(
      "JPEG, PNG veya iPhone HEIC fotoğrafı seçin.",
    );

  for (const quality of [0.85, 0.7, 0.55]) {
    let output: NativePhotoAsset;
    try {
      output = await io.encode(asset, size, quality);
    } catch {
      throw new PhotoPreparationError(
        "Fotoğraf açılamadı. Başka bir fotoğraf seçin.",
      );
    }
    if (output.uri === asset.uri)
      throw new PhotoPreparationError(
        "Fotoğraf hazırlanamadı. Yeniden deneyin.",
      );
    let keep = false;
    try {
      const outputSize = photoDimensions(output.width, output.height);
      const file = await io.inspect(output.uri);
      if (
        outputSize.width === output.width &&
        outputSize.height === output.height &&
        Number.isSafeInteger(file.size) &&
        file.size > 0 &&
        file.size <= MAX_PHOTO_BYTES &&
        photoEncoding(file.header) === "jpeg"
      ) {
        keep = true;
        return {
          uri: output.uri,
          name: "photo.jpg",
          type: "image/jpeg",
          cleanup: () => io.remove(output.uri),
        };
      }
    } finally {
      if (!keep) io.remove(output.uri);
    }
  }
  throw new PhotoPreparationError(
    "Fotoğraf küçültülemedi. Başka bir fotoğraf seçin.",
  );
}
