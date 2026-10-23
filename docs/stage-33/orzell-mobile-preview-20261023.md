# ORZELL isolated mobile preview — 23 October 2026

The prepared preview replaces the EPIFIZ header with the original O/Z emblem followed by RZELL and changes only the Expo display name to ORZELL. The source JPEG remains byte-for-byte identical to the approved reference. A clipped image viewport displays the emblem without modifying the bitmap. The surrounding header and system-font letters are a proposed layout, pending visual approval; this is not a final typography or splash-screen approval.

Prepare a disposable checkout of application revision `123e7339e2ab2a9e8e94f391a8431b73afc28efe`, then run the harness scripts in this order:

```bash
python3 scripts/prepare-stage33-native.py /absolute/path/to/application
python3 scripts/prepare-orzell-mobile.py /absolute/path/to/application
```

Do not apply the second script directly to the placeholder App.tsx on main. Both scripts expect the pinned application source. The original preparation script and existing native builds retain their existing defaults. The new workflow prepares and exports an isolated web artifact; it does not publish to the preview server or build an APK/IPA.

Verified locally on the prepared source:

- Canonical image checksum matches the manifest.
- Three preparation tests passed: exact asset preservation with stable identifiers, source drift rejection and tampered-asset rejection before writes.
- Seven authentication behavior checks and ten cancellation behavior checks passed after applying the ORZELL header.
- Shared types compilation and complete mobile TypeScript check passed.
- Expo web production export passed and included the original JPEG asset.
- Formatting and whitespace checks passed for the changed supported files.

Local pnpm's automatic install wrapper stopped on unapproved dependency lifecycle scripts; checks were then run using the installed TypeScript and Expo executables directly, without enabling those scripts. The checked-in lockfile was not changed. Browser visual QA could not run: no browser executable was installed and the browser download returned an invalid archive. No screenshot, launch, physical iPhone/Android or photo/AI acceptance is claimed. The proposed GitHub workflow has not been verified by this local record.

The JPEG is a complete reference board; it is not used as a native app icon. Technical IDs, URLs, stored bookings, payment integration and public photo/AI policy gates remain unchanged. Stage 33 remains NOT PASS pending the previously recorded device, reviewed-policy, real-photo/AI, privacy operations and recovery checks.
