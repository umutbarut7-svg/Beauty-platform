const syntheticPreviewEnabled = /*SYNTHETIC_PREVIEW*/ false;
const byId = (id) => document.getElementById(id);
const controls = {
  challenge: byId("challenge"),
  pin: byId("pin"),
  review: byId("review"),
  confirmation: byId("confirmation"),
  confirm: byId("synthetic-confirm"),
  private: byId("private-fields"),
  key: byId("key-file"),
  password: byId("password"),
  encrypt: byId("encrypt"),
  download: byId("download"),
};
let epoch = 0;
let trusted = null;
let downloadUrl = null;
let busy = false;

function privateReset() {
  controls.key.value = "";
  controls.password.value = "";
  controls.confirm.checked = false;
  controls.confirmation.disabled = true;
  controls.private.disabled = true;
}
function outputReset() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  byId("result").hidden = true;
}
function invalidate(message, clearPublic = false) {
  epoch += 1;
  trusted = null;
  busy = false;
  controls.challenge.disabled = false;
  controls.pin.disabled = false;
  controls.review.disabled = false;
  privateReset();
  outputReset();
  byId("summary").hidden = true;
  if (clearPublic) {
    controls.challenge.value = "";
    controls.pin.value = "";
  }
  byId("status").textContent = message;
}
function trustedNow() {
  return (
    trusted &&
    Date.now() < trusted.expires &&
    controls.pin.value.trim() === trusted.pin &&
    !busy
  );
}
const messages = {
  HANDOFF_CHALLENGE_PIN_MISMATCH:
    "Doğrulama kodu oturum dosyasıyla eşleşmiyor.",
  INDEPENDENT_HANDOFF_PIN_REQUIRED:
    "Ayrı kanaldan aldığın 64 karakterlik doğrulama kodunu gir.",
  HANDOFF_EXPIRED_OR_INVALID_LIFETIME:
    "Oturumun süresi dolmuş veya geçerlilik aralığı uygun değil.",
  HANDOFF_PRIVATE_INPUT_LIMIT:
    "Yapay anahtar dosyası en fazla 16 KB, parola en fazla 1 KB olabilir.",
  SYNTHETIC_PREVIEW_ONLY:
    "Bu önizleme yalnız yapay deneme oturumlarını kabul eder.",
  PUBLIC_FILE_LIMIT: "Genel oturum dosyası en fazla 8 KB olabilir.",
};
function errorMessage(error) {
  return (
    messages[error?.message] ||
    "İşlem doğrulanamadı. Dosyaları ve oturumu kontrol et."
  );
}

controls.review.addEventListener("click", async () => {
  invalidate("Genel oturum doğrulanıyor…");
  const ticket = epoch;
  const file = controls.challenge.files[0];
  try {
    if (!file || !file.size || file.size > 8192)
      throw new Error("PUBLIC_FILE_LIMIT");
    const pin = controls.pin.value.trim();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const reviewed = await reviewHandoffChallenge(bytes, pin);
    if (ticket !== epoch) return;
    if (reviewed.request.context.snapshotBoundary !== "SYNTHETIC_ONLY")
      throw new Error("SYNTHETIC_PREVIEW_ONLY");
    trusted = { bytes, pin, expires: reviewed.expires };
    byId("backup-id").textContent = reviewed.request.context.backupId;
    byId("source-id").textContent = reviewed.request.context.applicationSha;
    byId("expiry").textContent = reviewed.request.expiresAt;
    byId("summary").hidden = false;
    if (syntheticPreviewEnabled) {
      controls.confirmation.disabled = false;
      byId("status").textContent =
        "Yapay oturum doğrulandı. Deneme onayından sonra yapay dosyayı seçebilirsin.";
    } else {
      byId("status").textContent =
        "Ekran inceleme modu: dosya işleme etkin değil.";
    }
  } catch (error) {
    if (ticket === epoch) invalidate(errorMessage(error));
  }
});
controls.confirm.addEventListener("change", () => {
  if (!syntheticPreviewEnabled || !trustedNow() || !controls.confirm.checked) {
    controls.private.disabled = true;
    controls.key.value = "";
    controls.password.value = "";
    outputReset();
    return;
  }
  controls.private.disabled = false;
});
controls.encrypt.addEventListener("click", async () => {
  if (!syntheticPreviewEnabled || !trustedNow() || !controls.confirm.checked)
    return;
  const ticket = epoch;
  const approved = trusted;
  const file = controls.key.files[0];
  let keyBytes = null;
  let passwordBytes = null;
  let packet = null;
  outputReset();
  busy = true;
  controls.challenge.disabled = true;
  controls.pin.disabled = true;
  controls.review.disabled = true;
  controls.private.disabled = true;
  controls.confirmation.disabled = true;
  byId("status").textContent = "Yapay dosya tarayıcı belleğinde şifreleniyor…";
  try {
    await reviewHandoffChallenge(approved.bytes, approved.pin);
    if (ticket !== epoch) return;
    if (!file || !file.size || file.size > 16384)
      throw new Error("HANDOFF_PRIVATE_INPUT_LIMIT");
    keyBytes = new Uint8Array(await file.arrayBuffer());
    if (ticket !== epoch) return;
    passwordBytes = controls.password.value
      ? new TextEncoder().encode(controls.password.value)
      : null;
    packet = await wrapRecoveryKey(
      approved.bytes,
      approved.pin,
      keyBytes,
      passwordBytes,
    );
    if (ticket !== epoch || Date.now() >= approved.expires) return;
    downloadUrl = URL.createObjectURL(
      new Blob([packet], { type: "application/json" }),
    );
    byId("result").hidden = false;
    byId("status").textContent =
      "Şifreli deneme paketi hazır. İndirme bağlantısı oturum süresi boyunca kullanılabilir.";
    controls.key.value = "";
    controls.password.value = "";
    controls.confirm.checked = false;
  } catch (error) {
    if (ticket === epoch) invalidate(errorMessage(error));
  } finally {
    keyBytes?.fill(0);
    passwordBytes?.fill(0);
    packet?.fill(0);
    if (ticket === epoch) {
      busy = false;
      controls.challenge.disabled = false;
      controls.pin.disabled = false;
      controls.review.disabled = false;
      controls.private.disabled = true;
    }
  }
});
controls.download.addEventListener("click", () => {
  if (!downloadUrl || !trusted || Date.now() >= trusted.expires) {
    invalidate(
      "Oturumun süresi doldu. Yeni bir yapay oturumla başlayabilirsin.",
    );
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = "orzell-deneme-kapsulu.json";
  anchor.click();
});
controls.challenge.addEventListener("change", () =>
  invalidate("Oturum dosyası değişti. Yeniden doğrula."),
);
controls.pin.addEventListener("input", () =>
  invalidate("Doğrulama kodu değişti. Yeniden doğrula."),
);
byId("reset").addEventListener("click", () =>
  invalidate("Oturum ve seçili dosyalar temizlendi.", true),
);
window.addEventListener("pagehide", () =>
  invalidate("Oturum kapatıldı.", true),
);
setInterval(() => {
  if (trusted && Date.now() >= trusted.expires)
    invalidate(
      "Oturumun süresi doldu. Yeni bir yapay oturumla başlayabilirsin.",
    );
}, 500);
