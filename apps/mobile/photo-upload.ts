// Browser preparation is local: only the normalized JPEG enters FormData.
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 64_000_000;
const MAX_EDGE = 1600;

export class PhotoPreparationError extends Error {}

export function photoEncoding(
  bytes: Uint8Array,
): "jpeg" | "png" | "heic" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return "png";
  const ascii = (start: number) =>
    String.fromCharCode(...bytes.slice(start, start + 4));
  if (ascii(4) === "ftyp") {
    for (let offset = 8; offset + 4 <= bytes.length; offset += 4)
      if (
        ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(offset))
      )
        return "heic";
  }
  return null;
}

export function photoDimensions(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_SOURCE_PIXELS
  )
    throw new PhotoPreparationError(
      "Bu fotoğrafın çözünürlüğü çok büyük veya okunamıyor. Başka bir fotoğraf seçin.",
    );
  const ratio = Math.min(1, MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export async function prepareWebPhoto(asset: { uri: string; file?: Blob }) {
  const source = asset.file ?? (await (await fetch(asset.uri)).blob());
  if (!source.size || source.size > MAX_SOURCE_BYTES)
    throw new PhotoPreparationError(
      "Seçilen fotoğraf boş veya 40 MB sınırını aşıyor. Daha küçük bir fotoğraf seçin.",
    );
  const encoding = photoEncoding(
    new Uint8Array(await source.slice(0, 64).arrayBuffer()),
  );
  if (!encoding)
    throw new PhotoPreparationError(
      "JPEG, PNG veya iPhone HEIC fotoğrafı seçin.",
    );

  const image = new Image();
  const canvas = document.createElement("canvas");
  const localUrl = URL.createObjectURL(source);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      deadline = setTimeout(
        () =>
          reject(
            new PhotoPreparationError("Fotoğraf açılamadı. Yeniden seçin."),
          ),
        20000,
      );
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new PhotoPreparationError(
            encoding === "heic"
              ? "Tarayıcınız bu HEIC fotoğrafını açamadı. JPEG veya PNG seçin."
              : "Fotoğraf okunamadı. Başka bir fotoğraf seçin.",
          ),
        );
      image.src = localUrl;
    });
    clearTimeout(deadline);
    const size = photoDimensions(image.naturalWidth, image.naturalHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new PhotoPreparationError(
        "Fotoğraf hazırlanamadı. Yeniden deneyin.",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    // Re-encoding drops the original EXIF/GPS and applies browser image orientation.
    for (const quality of [0.85, 0.7, 0.55]) {
      const jpeg = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (
        jpeg?.type === "image/jpeg" &&
        jpeg.size > 0 &&
        jpeg.size <= MAX_PHOTO_BYTES
      )
        return jpeg;
    }
    throw new PhotoPreparationError(
      "Fotoğraf küçültülemedi. Başka bir fotoğraf seçin.",
    );
  } finally {
    clearTimeout(deadline);
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(localUrl);
    canvas.width = 1;
    canvas.height = 1;
  }
}
