import { requireOptionalNativeModule } from "expo";
import type { NativePhotoAsset } from "./native-photo";

export const iosPhotoEncoder = requireOptionalNativeModule<{
  encode(
    uri: string,
    maxEdge: number,
    quality: number,
  ): Promise<NativePhotoAsset>;
}>("OrzellPhoto");
