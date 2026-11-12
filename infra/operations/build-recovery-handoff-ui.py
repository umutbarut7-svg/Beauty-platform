#!/usr/bin/env python3
"""Build a self-contained review or synthetic-only page; real key intake stays off."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).parent


def build(output, synthetic=False):
    if type(synthetic) is not bool:
        raise ValueError("EXPLICIT_PREVIEW_MODE_REQUIRED")
    template = (ROOT/"recovery-handoff-ui/page.html").read_text()
    style = (ROOT/"recovery-handoff-ui/style.css").read_text()
    app = (ROOT/"recovery-handoff-ui/app.js").read_text()
    core = (ROOT/"wrap-recovery-handoff.mjs").read_text()
    if any(len(v.encode()) > 200000 for v in (template, style, app, core)):
        raise ValueError("PUBLIC_PAGE_SOURCE_LIMIT")
    core = re.sub(r"^export ", "", core, flags=re.M)
    if re.search(r"^\s*(import|export)\s", core, re.M):
        raise ValueError("SELF_CONTAINED_CORE_REQUIRED")
    marker = "/*SYNTHETIC_PREVIEW*/ false"
    if app.count(marker) != 1:
        raise ValueError("FIXED_PREVIEW_SWITCH_REQUIRED")
    app = app.replace(marker, "true" if synthetic else "false")
    script = core+"\n"+app
    if "</script" in script.lower() or "</style" in style.lower():
        raise ValueError("INLINE_SOURCE_BOUNDARY_REQUIRED")
    markers = ("/*@@SCRIPT@@*/", "/*@@STYLE@@*/", "@@MODE_NOTICE@@", "@@CSP@@")
    if any(template.count(marker) != 1 for marker in markers):
        raise ValueError("FIXED_PAGE_TEMPLATE_REQUIRED")
    notice = "Yapay deneme modu. Gerçek kurtarma anahtarı seçme." if synthetic else "Ekran inceleme modu. Dosya şifreleme etkin değil."
    html = template.replace("/*@@SCRIPT@@*/", script).replace("/*@@STYLE@@*/", style).replace("@@MODE_NOTICE@@", notice)
    script_body = re.search(r'<script type="module">(.*?)</script>', html, re.S).group(1)
    style_body = re.search(r'<style>(.*?)</style>', html, re.S).group(1)
    digest = lambda value: base64.b64encode(hashlib.sha256(value.encode()).digest()).decode()
    csp = ("default-src 'none'; script-src 'sha256-"+digest(script_body)+"'; style-src 'sha256-"+digest(style_body)
           +"'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; "
            "form-action 'none'; frame-src 'none'; worker-src 'none'")
    data = html.replace("@@CSP@@", csp).encode()
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)
    return {"status": "SYNTHETIC_FIXTURE_PAGE_BUILT" if synthetic else "REVIEW_ONLY_PAGE_BUILT",
            "htmlSha256": hashlib.sha256(data).hexdigest(), "realKeyIntakeEnabled": False,
            "deployed": False, "realRecoveryReady": False}


def main():
    if len(sys.argv) == 1:
        print(json.dumps({"status": "OFFLINE_NO_ACTION", "realKeyIntakeEnabled": False}))
        return 0
    if len(sys.argv) != 3 or sys.argv[1] not in ("--build-preview", "--build-synthetic-fixture-preview"):
        print(json.dumps({"status": "UNSUPPORTED_PREVIEW_ARGUMENTS", "realKeyIntakeEnabled": False}))
        return 2
    try:
        print(json.dumps(build(sys.argv[2], sys.argv[1] == "--build-synthetic-fixture-preview")))
        return 0
    except Exception:
        print(json.dumps({"status": "PREVIEW_BUILD_REJECTED", "realKeyIntakeEnabled": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
