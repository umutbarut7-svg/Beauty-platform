import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { prepareNativePhoto, type NativePhotoAsset } from "./native-photo";
import { MAX_SOURCE_BYTES, PhotoPreparationError } from "./photo-upload";

export function prepareDevicePhoto(asset: NativePhotoAsset) {
  return prepareNativePhoto(asset, {
    async inspect(uri) {
      const file = new File(uri);
      const size = file.size;
      if (
        !file.exists ||
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_SOURCE_BYTES
      )
        throw new PhotoPreparationError(
          "Fotoğraf okunamadı veya 40 MB sınırını aşıyor.",
        );
      return {
        size,
        header: new Uint8Array(await file.slice(0, 64).arrayBuffer()),
      };
    },
    async encode(source, size, quality) {
      const context = ImageManipulator.manipulate(source.uri);
      try {
        context.resize(size);
        const image = await context.renderAsync();
        try {
          return await image.saveAsync({
            format: SaveFormat.JPEG,
            compress: quality,
          });
        } finally {
          image.release();
        }
      } finally {
        context.release();
      }
    },
    remove(uri) {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // Cache cleanup must not turn a completed upload into a failed upload.
      }
    },
  });
}
