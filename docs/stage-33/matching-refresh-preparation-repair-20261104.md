# Same-plan refresh preparation repair

Publication 41813561525 / SSM c6c514cb-68cd-4b59-b143-e81f26fb82f1 stopped at PREPARATION_FAILED before image loading or service mutation. The publisher expected matching-refresh-compatibility instead of the actual visual-service-compatibility compiled module.

Keep the exact f712d064 application, immutable artifact 13313350527 and all integrity, migration, image, environment, quota, queue and rollback checks. A new bounded request requires the previous PREPARATION_FAILED record with the same source/images and rechecks the full original live baseline. No operation replay or provider call.

Regression fixtures now read the independent image-rehearsal verifier rather than mirroring the publisher list. 21 local behavior tests pass; CI and repaired deployment evidence follow. No TestFlight update until verified API delivery.
