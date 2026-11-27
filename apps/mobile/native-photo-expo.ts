import { File, FileMode } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { prepareNativePhoto, type NativePhotoAsset } from "./native-photo";
import { MAX_SOURCE_BYTES, PhotoPreparationError } from "./photo-upload";

export function prepareDevicePhoto(
  asset: NativePhotoAsset,
  onStep?: (step: string) => void,
) {
  return prepareNativePhoto(asset, {
    async inspect(uri) {
      try {
        onStep?.(uri === asset.uri ? "inspect source" : "inspect JPEG");
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
        // File.slice constructs a Blob from bytes, unsupported by native RN Blob.
        // Read only the signature and always release the native file descriptor.
        const handle = file.open(FileMode.ReadOnly);
        try {
          return { size, header: handle.readBytes(Math.min(64, size)) };
        } finally {
          handle.close();
        }
      } catch (error) {
        if (error instanceof PhotoPreparationError) throw error;
        throw new PhotoPreparationError(
          "Fotoğraf okunamadı. Fotoğrafı yeniden seçin.",
        );
      }
    },
    async encode(source, size, quality) {
      onStep?.("create image context");
      const context = ImageManipulator.manipulate(source.uri);
      try {
        context.resize(size);
        onStep?.("render resized image");
        const image = await context.renderAsync().catch((error: unknown) => {
          // Expose native rejection details only to the optional probe callback.
          if (onStep) {
            const reason = error instanceof Error ? error.message : String(error);
            onStep(`render rejected: ${reason.slice(0, 160)}`);
          }
          throw error;
        });
        try {
          onStep?.("save JPEG");
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

export function appendDevicePhoto(form: FormData, photo: { uri: string }) {
  // Expo 57's default fetch serializes File.bytes(); URI-only RN parts reject.
  // The verified encoder output has a .jpg name and image/jpeg native MIME.
  form.append("photo", new File(photo.uri));
}
