# Preview acceptance — 22 October 2026

Status: core journey observed on an iPhone browser; Stage 33 remains NOT PASS.

Owner-operated test confirmed: customer booking appears in both customer and business lists; business status reaches COMPLETED; a result explicitly marked as a test with no real service is saved; customer reads the result, submits UNSURE, and sees it in Beauty Passport. After browser reload and sign-in, both history and booking reappear. Intermediate transitions were not individually observed because multiple status buttons were pressed.

Publication run: https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39826341816 (success). Public synthetic booking, cancellation and access-isolation assertions passed in its logs.

Next prepared operation: test-independent-customer.sh creates only a private synthetic business and generated example.test accounts. Checks independent-customer booking, owner/customer lists, cross-customer read/cancel denial, customer status-management denial, duplicate-slot denial, customer cancellation, persisted cancelled status, and released availability. Cleanup cancels a remaining test appointment, deactivates the private fixture, and logs out test sessions. No deployment, real-salon writes, payment, new infrastructure or secret output. Live outcome is pending execution.

Known UI gap: the pinned customer screen has no cancellation button, although the cancellation API exists. API acceptance does not establish customer UI cancellation acceptance. Other open acceptance areas include real-photo quality, policies and remaining device checks; do not mark all Stage 33 PASS from this journey.
