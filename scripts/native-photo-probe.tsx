// CI-only entrypoint. The workflow copies this into an ephemeral simulator app.
import { useEffect } from "react";
import { Text } from "react-native";
import { File, Paths } from "expo-file-system";
import { MvpApiClient } from "@beauty-platform/types";
import { appendDevicePhoto, prepareDevicePhoto } from "./native-photo-expo";

const origin = "http://127.0.0.1:18733";
export default function NativePhotoProbe() {
  useEffect(() => {
    let step = "download synthetic fixture";
    let cleanup: (() => void) | undefined;
    let source: File | undefined;
    void (async () => {
      try {
        source = await File.downloadFileAsync(
          origin + "/fixture.png",
          new File(Paths.cache, "native-photo-synthetic.png"),
          { idempotent: true },
        );
        let oldReadRejected = false;
        try {
          await source.slice(0, 64).arrayBuffer();
        } catch {
          oldReadRejected = true;
        }
        step = "actual native file read and JPEG encoder";
        const photo = await prepareDevicePhoto({
          uri: source.uri,
          width: 2560,
          height: 1920,
        });
        cleanup = photo.cleanup;
        const api = new MvpApiClient(origin);
        step = "native HTTPS-compatible client login on local fixture server";
        await api.signIn(
          "login",
          "synthetic@example.test",
          "synthetic-native-password",
        );
        const oldForm = new FormData();
        oldForm.append("photo", {
          uri: photo.uri,
          name: "photo.jpg",
          type: "image/jpeg",
        } as unknown as Blob);
        let oldMultipartRejected = false;
        try {
          await api.request("/upload", "POST", oldForm, { multipart: true });
        } catch {
          oldMultipartRejected = true;
        }
        step = "actual Expo fetch multipart upload";
        const form = new FormData();
        appendDevicePhoto(form, photo);
        const result = await api.request<{ status: string }>(
          "/upload",
          "POST",
          form,
          { multipart: true },
        );
        if (result.status !== "VALIDATED")
          throw new Error("Synthetic upload not validated");
        step = "native temporary file cleanup";
        cleanup();
        cleanup = undefined;
        if (new File(photo.uri).exists || !source.exists)
          throw new Error("Unexpected cleanup scope");
        if (!oldReadRejected || !oldMultipartRejected)
          throw new Error("Pinned runtime regression not reproduced");
        await fetch(origin + "/result", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "PASS",
            oldReadRejected,
            oldMultipartRejected,
            preparedFileRemoved: true,
            sourcePreserved: true,
          }),
        });
      } catch {
        await fetch(origin + "/result", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "FAIL", step }),
        }).catch(() => undefined);
      } finally {
        cleanup?.();
        if (source?.exists) source.delete();
      }
    })();
  }, []);
  return <Text>CI native photo probe — synthetic pixels only</Text>;
}
