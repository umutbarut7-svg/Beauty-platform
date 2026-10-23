# Photo browser acceptance

`scripts/check-orzell-photo-journey.cjs` runs against the exported preview with intercepted synthetic API responses. Its route handler serves local assets, fulfills only explicitly listed API routes, and aborts every other remote request. No account, consent, image, model call, storage object or booking is created on a live server. The one-pixel PNG and all displayed content are test fixtures.

The test exercises the actual browser UI, file chooser and multipart request construction:

- An unavailable photo policy hides the upload control.
- Missing explicit consent prevents consent/upload requests.
- A selected PNG is uploaded as multipart data only after the synthetic policy is accepted.
- NEEDS_INFORMATION renders a question and sends the entered answer with the expected attempt number.
- PLAN renders steps and a subsequent matching response renders a professional/service result.
- Withdrawal during an in-flight analysis clears results; the late response must not restore the plan or match.

The same workflow also checks the original emblem header at 320, 390 and 768 pixels. Screenshots contain only fixtures and are temporary CI review artifacts. Browser checks establish UI behavior for these fixtures, not server authorization, physical erasure, model quality or native picker behavior.

Previously verified native compilation: [run 39842359470](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39842359470), application `123e7339e2ab2a9e8e94f391a8431b73afc28efe`, harness `66b290bcce0944aa73ed322a24201bef58c03265`. Both Android APK and unsigned iOS simulator builds succeeded. Those artifacts use the earlier EPIFIZ preview identity, not this ORZELL header. Neither build constitutes physical-device acceptance or an installable iPhone/TestFlight release.

Still required: physical devices; reviewed operator/contact and photo/verification policies; real-photo PLAN/follow-up/match quality; live photo/provider UX; sustained privacy operations and recovery evidence. The company/contact fields remain unset and public provider/policy gates remain closed. Stage 33 remains NOT PASS.
