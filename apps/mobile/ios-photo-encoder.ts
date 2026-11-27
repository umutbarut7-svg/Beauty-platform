// Metro selects the iOS implementation for native iPhone builds.
import type { NativePhotoAsset } from "./native-photo";
export const iosPhotoEncoder: {
  encode(
    uri: string,
    maxEdge: number,
    quality: number,
  ): Promise<NativePhotoAsset>;
} | null = null;
