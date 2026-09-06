# Source remediation continuation

Starting HEAD and origin/master: `e27ebeb677f3ca8ad5f04b31b1a7fd659d9792c7`, branch master. Preflight repeated pwd/status/branch/HEAD/fetch/origin/diff/cached diff; only the existing evidence directory and scripts were untracked. Fetch required the same approved sandbox retry and succeeded. Existing raw funding evidence was not regenerated or modified.

Changes:

- Removed the Historical V1 panel from App.vue's ordinary developer proof disclosure. The rejected V1 address guard remains unchanged.
- Moved the historical smoke JSON unchanged to docs/history/v1; updated root README and provenance-test paths.
- Added actual App.vue server-rendering coverage with the exact V2 environment and explicit valid/missing/malformed/V1/mismatched configuration assertions. This is rendered source regression evidence, not a live-browser attestation.
- Fixed a demonstrated error-classification bug: stack frame names such as processTicksAndRejections could turn a timeout into CANCELED. Stack text remains in diagnostics, but does not determine transaction outcome. Added a dedicated regression. Existing failed-execution and no-rebroadcast tests remain intact.
- No contract, SDK dependency, transaction broadcast, or hash-persistence logic changed. No version method added.

The initial full check failure is retained in check.txt; it exposed the timeout classification issue. The corrected full run is check-fixed.txt. Source commit identity is the Git commit containing this document, discoverable with `git log -1 --format=%H -- app/src/App.vue` after this scoped commit.

Deployment remains a separate phase: the current public attestation records the old misconfigured production build. Do not mark it corrected until Vercel's existing production/preview build environments are set to the exact V2 address and a new committed build is READY. Use normal local Vercel login if credentials remain unavailable; never request a token in chat.

Live proof is gated on the existing creator wallet. Re-read p-1 before deciding whether an early rejection is still possible. No new policy or resolution was broadcast in this continuation.
