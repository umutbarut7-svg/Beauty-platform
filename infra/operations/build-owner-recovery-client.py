#!/usr/bin/env python3
"""Build the fixed-snapshot phone-local owner client; no server or upload endpoint."""
import base64
import hashlib
from pathlib import Path
import re
import sys

OPS = Path(__file__).parent
STYLE = '''
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#11121a;color:#eeeef5}
*{box-sizing:border-box}body{margin:0;padding:32px 18px 64px}main{max-width:680px;margin:auto}
.brand{letter-spacing:.2em;font-size:13px;color:#c5b9f8}h1{font-size:32px;line-height:1.14;margin:20px 0 12px}
p{line-height:1.6;color:#c2c1ce}.box{background:#1b1c28;border:1px solid #363646;border-radius:18px;padding:20px;margin:20px 0}
h2{font-size:19px;margin:0 0 18px}label{display:block;margin:16px 0 8px;font-weight:600}
textarea,input{width:100%;border:1px solid #5b5a6b;border-radius:10px;background:#10111a;color:#fff;padding:12px;font:16px system-ui}
textarea{min-height:100px;resize:vertical;font:12px monospace;overflow-wrap:anywhere}input[type=file]{font-size:14px}
button{border:0;border-radius:10px;padding:13px 18px;margin:16px 8px 0 0;background:#d5c8ff;color:#201634;font-size:16px;font-weight:650}
button:disabled{opacity:.38}button.secondary{background:#343442;color:#fff}small{display:block;color:#b7b5c8;line-height:1.6}
#status{min-height:60px;white-space:pre-wrap;overflow-wrap:anywhere;color:#e0d5ff}#context{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.7}fieldset{border:0;padding:0;margin:0}a{color:#dbcdff}
'''
APP = r'''
const $ = id => document.getElementById(id);
let epoch = 0, review = null, expiry = null;
function resetPrivate() { epoch++; $('key').value=''; $('password').value=''; $('capsule').value=''; $('copy').disabled=true; }
function invalidate() { resetPrivate(); review=null; clearTimeout(expiry); $('private').disabled=true; $('context').textContent=''; }
function message(text) { $('status').textContent=text; }
$('challenge').addEventListener('input', () => { invalidate(); message('Oturumu yeniden doğrula.'); });
$('reset').addEventListener('click', () => { invalidate(); $('challenge').value=''; message('Oturum bilgileri temizlendi.'); });
addEventListener('pagehide', invalidate);
$('review').addEventListener('click', async () => {
  invalidate(); const generation=epoch;
  try {
    if (!isSecureContext || !crypto.subtle) throw new Error('HTTPS_REQUIRED');
    const receipt=parseOwnerReceipt($('challenge').value);
    const next=await reviewOwnerChallenge(receipt.encoded,receipt.pin);
    if(generation!==epoch) return;
    review=next; $('private').disabled=false;
    $('context').textContent='Yedek: '+next.request.context.backupId+'\nTürkiye saatiyle süre sonu: '+new Date(next.expires).toLocaleTimeString('tr-TR',{timeZone:'Europe/Istanbul',hour12:false})+'\nKapsam: izole geri yükleme ve erişim karantinası';
    expiry=setTimeout(() => { invalidate(); message('Oturum süresi doldu. Anahtar seçimi temizlendi.'); },Math.max(0,next.expires-Date.now()));
    message('Oturum ve sabit yedek bağları doğrulandı. Anahtar dosyanı şimdi seçebilirsin.');
  } catch (error) {
    if(generation!==epoch) return;
    message(error.message==='HANDOFF_EXPIRED_OR_INVALID_LIFETIME'
      ? 'Bu oturumun süresi dolmuş. CloudShell’de yeni oturum açıp yeni çıktıyı yapıştır.'
      : error.message==='HANDOFF_CHALLENGE_PIN_MISMATCH'
        ? 'Kopyalanan çıktı değişmiş veya eksik. Kendi CloudShell oturumundaki son çıktıyı yeniden kopyala.'
        : 'Tek bir güncel CloudShell çıktısını tamamıyla yapıştır. Uzun ve kısa kodu ayrı ayrı seçmene gerek yok.');
  }
});
for(const id of ['key','password']) $(id).addEventListener('input', () => { epoch++; $('capsule').value=''; $('copy').disabled=true; });
$('encrypt').addEventListener('click', async () => {
  const generation=++epoch; let key=null,password=null; $('capsule').value=''; $('copy').disabled=true;
  try {
    if(!review || Date.now()>=review.expires) throw new Error('EXPIRED');
    const file=$('key').files[0]; if(!file || file.size>32768) throw new Error('KEY_FILE_LIMIT');
    const challenge=review.challenge, pin=review.observed;
    // Revalidate the authenticated context BEFORE reading the selected file.
    await reviewOwnerChallenge(base64(challenge),pin);
    if(generation!==epoch) return;
    key=extractPrivatePem(await file.text());
    password=$('password').value ? new TextEncoder().encode($('password').value) : null;
    if(generation!==epoch) return;
    const capsule=await wrapRecoveryKey(challenge,pin,key,password);
    if(generation!==epoch || !review || Date.now()>=review.expires) return;
    $('capsule').value=frameCapsule(capsule); $('copy').disabled=false;
    message('Şifreli kapsül hazır. Tamamını bekleyen CloudShell oturumuna yapıştır. Bu işlem henüz geri yükleme sonucu değildir.');
  } catch { if(generation===epoch) message('Kapsül üretilemedi. Dosyada tek bir özel PEM anahtarı bulunduğunu ve oturum süresini kontrol et.'); }
  finally { if(key)key.fill(0); if(password)password.fill(0); if(generation===epoch){$('key').value='';$('password').value='';} }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('capsule').value); message('Şifreli kapsül kopyalandı. CloudShell oturumuna yapıştır.'); }
  catch { $('capsule').focus(); $('capsule').select(); message('Kapsül alanının tamamını seçip kopyala.'); }
});
'''
PAGE = '''<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="@@CSP@@"><title>ORZELL · Kurtarma aktarımı</title><style>@@STYLE@@</style></head><body><main>
<div class="brand">ORZELL / ÖZEL İŞLEM</div><h1>Güvenli kurtarma aktarımı</h1>
<p>Anahtar dosyan bu sayfada, telefonunda şifrelenir. CloudShell'e yalnız şifreli kapsülü aktar. Gerçek anahtarı sohbete veya terminale yapıştırma.</p>
<section class="box"><h2>1. Bekleyen oturumu doğrula</h2><small>Yeni sürüm: tek yapıştırma. Kendi CloudShell oturumundaki {"backupId": ...} ile başlayan son çıktıyı bütünüyle kopyala. Kodları ayrı ayrı ayırma.</small><label for="challenge">CloudShell çıktısı</label><textarea id="challenge" maxlength="20000" spellcheck="false" autocomplete="off"></textarea>
<button id="review">Oturumu doğrula</button><div id="context"></div></section>
<section class="box"><h2>2. Telefonda şifrele</h2><fieldset id="private" disabled><label for="key">ORZELL-Kurtarma-Anahtari.txt veya PEM</label><input id="key" type="file" accept=".txt,.pem"><label for="password">Anahtar parolası (varsa)</label><input id="password" type="password" autocomplete="off"><button id="encrypt">Şifreli kapsül oluştur</button></fieldset><small>Dosya ve parola sunucuya gönderilmez. Tarayıcı belleğinin tüm kopyalarını fiziksel olarak silme garantisi yoktur; iş bittiğinde sayfayı kapat.</small></section>
<section class="box"><h2>3. Şifreli kapsülü aktar</h2><textarea id="capsule" readonly aria-label="Şifreli kapsül" spellcheck="false"></textarea><button id="copy" disabled>Kapsülü kopyala</button><button id="reset" class="secondary">Temizle</button></section><p id="status" role="status" aria-live="polite">Önce kendi CloudShell oturumunu başlat, ardından son çıktıyı tek seferde buraya yapıştır.</p>
</main><script type="module">@@SCRIPT@@</script></body></html>'''


def build():
    script = '\n'.join(re.sub(r'^export ', '', (OPS/name).read_text(), flags=re.M)
                       for name in ('wrap-recovery-handoff.mjs', 'recovery-owner-client.mjs')) + '\n' + APP
    if re.search(r'^\s*(import|export)\s', script, re.M) or '</script' in script.lower():
        raise ValueError('SELF_CONTAINED_SCRIPT_REQUIRED')
    digest = lambda text: base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()
    csp = ("default-src 'none'; script-src 'sha256-"+digest(script)+"'; style-src 'sha256-"+digest(STYLE)
           +"'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'")
    return PAGE.replace('@@STYLE@@', STYLE).replace('@@SCRIPT@@', script).replace('@@CSP@@', csp)


if __name__ == '__main__':
    Path(sys.argv[1]).write_text(build())
