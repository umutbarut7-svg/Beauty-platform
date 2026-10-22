#!/usr/bin/env python3
"""Apply the narrowly scoped auth UX overlay to the pinned preview source."""
import hashlib, pathlib
SOURCE_BLOB = "54d1dc5cb665ad76036d4ab51ddf1e78dde9f7f1"
def patch(path):
    data=path.read_bytes()
    blob=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if blob!=SOURCE_BLOB: raise SystemExit("Preview App source differs; no patch applied")
    text=data.decode()
    text=text.replace("  async function choose(b: Business) {", "  async function authenticate(mode: \"login\" | \"register\") {\n    const normalizedEmail = email.trim().toLowerCase();\n    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizedEmail)) {\n      setNotice(\"Geçerli bir e-posta adresi girin.\");\n      return;\n    }\n    if (!password || (mode === \"register\" && password.length < 12)) {\n      setNotice(mode === \"register\"\n        ? \"Hesap oluşturmak için şifreniz en az 12 karakter olmalı.\"\n        : \"Şifrenizi girin.\");\n      return;\n    }\n    reset();\n    try {\n      const value = await api.signIn(mode, normalizedEmail, password);\n      setPassword(\"\");\n      setUser(value);\n    } catch (error) {\n      if (error instanceof ApiError && [400, 401, 409, 429].includes(error.status)) {\n        setNotice(error.status === 401\n          ? \"E-posta veya şifre hatalı. Henüz kaydolmadıysanız önce Hesap oluştur seçeneğini kullanın.\"\n          : error.status === 409\n            ? \"Bu e-posta zaten kayıtlı. Şifrenizle Giriş yap seçeneğini kullanın.\"\n            : error.status === 429\n              ? \"Çok fazla deneme yapıldı. Bir dakika bekleyip yeniden deneyin.\"\n              : \"E-posta biçimini kontrol edin. Yeni kayıt için şifre en az 12 karakter olmalı.\");\n        return;\n      }\n      throw error;\n    }\n  }\n"+"  async function choose(b: Business) {", 1)
    before="            {button(\"Giriş yap\", async () => {\n              reset();\n              const u = await api.signIn(\"login\", email, password);\n              setPassword(\"\");\n              setUser(u);\n            })}\n            {button(\"Hesap oluştur\", async () => {\n              reset();\n              const u = await api.signIn(\"register\", email, password);\n              setPassword(\"\");\n              setUser(u);\n            })}"
    after="            <Text style={styles.small}>\n              Yeni hesap için şifre en az 12 karakter olmalı.\n            </Text>\n            {button(\"Giriş yap\", () => authenticate(\"login\"))}\n            {button(\"Hesap oluştur\", () => authenticate(\"register\"))}"
    if text.count(before)!=1: raise SystemExit("Expected auth handlers missing")
    path.write_text(text.replace(before,after,1))
if __name__=="__main__":
    import sys
    patch(pathlib.Path(sys.argv[1]))
