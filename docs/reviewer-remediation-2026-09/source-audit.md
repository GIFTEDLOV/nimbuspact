# Source and baseline audit

Audited HEAD: `e27ebeb677f3ca8ad5f04b31b1a7fd659d9792c7`. No product code changed. Contract code from the finalized deployment payload equals the current finalized gen_getContractCode result and the checkout after CRLF-to-LF normalization: [source parity](deployment/source-parity.json). The byte difference is line endings, not a contract defect.

| Baseline requirement | Finding and source |
| --- | --- |
| Payable create_policy | Confirmed: contracts/nimbuspact.py:449, @gl.public.write.payable. |
| Exact payout value | Confirmed: create_policy rejects nonpositive payout and gl.message.value != payout_amount before storage creation. Live funding all-data.value independently equals stored payout. |
| No separate V1 funding method | Confirmed in source: createPolicy sends create_policy with value=payoutWei in one write. **Production configuration fails:** effective environment is V1, blocked by exact V2 allowlist. |
| Window guard before web/nondeterminism/mutation | Confirmed: resolve_policy:531 checks deterministic time before resolution_attempts increment and _resolve_from_source; web access:263 runs inside strict_eq:430. |
| NOT_TRIGGERED creator refund | Confirmed: refund_policy:589 authenticates stored creator, checks status and solvency, sets terminal flags, emits exact payout to creator. |
| DATA_UNAVAILABLE retry | Confirmed: resolve_policy permits retries before grace ends without changing fixed policy terms. First unavailable timestamp is retained across unavailable retries. Successful retry resets it. |
| Unavailable refund grace | Confirmed: RECOVERY_GRACE_SECONDS=86400; refund fails before first failure time + 86400. |
| Duplicate settlement | Confirmed guards on withdrawn/refunded/status in claim_payout and refund_policy. External transfer emits on finalized. Claim emits before assigning terminal flags in source; emission is deferred and both belong to the same execution. README's universal claim that flags always precede emission is imprecise. |
| Beneficiary-only TRIGGERED payout | Confirmed: claim_payout requires TRIGGERED and caller equality with beneficiary, plus solvency. |
| FINALIZED alone not success | Confirmed for classifyReceipt/runLifecycle: requires FINISHED_WITH_RETURN, including failed/missing-execution tests. **Expected-state enforcement is incomplete**, described below. |
| Persisted-hash recovery | Confirmed: runLifecycle reuses saved hash, skips rebroadcast, retains unresolved hash. recoverPendingTransactions also polls saved hashes. |
| Object error rendering | Confirmed recursive normalization with cycle/depth handling and bounded safe JSON. Frontend tests cover nested objects and prohibit object coercion. |
| version() returns 2.0.0 | **Refuted.** There is no version method in either source or deployed code. Live view fails on undefined method; raw response saved in deployment/version-read.json and rpc/. |
| Frontend version guard | **Absent.** verifyBradburyReadOnlyEvidence checks finalized deployment and get_policy_count, not version. A fake 2.0.0 constant or a failing required version call would not prove deployed version. |

The fields `escrow_funded`, `settled`, `settlement_recipient`, and `settlement_reason` are not literal fields in deployed Policy. Funding equivalence is derived from exact payable creation, stored payout, status/flags, and current contract balance. Refund equivalence would use REFUNDED, refunded=true, withdrawn=true, creator, resolution_result, and actual external transfer proof. No refund state is claimed in this pass.

## Additional frontend gaps to remediate after access is restored

- getPolicies/getPolicy use SDK default `latest-nonfinal` rather than explicit finalized state. The evidence collector explicitly used `latest-final`.
- createPolicy verifies an immutable policy fingerprint, but resolve/claim/refund callbacks merely return getPolicy without asserting the expected outcome/terminal flags.
- recoverPendingTransactions removes a successful receipt entry and returns a success message before checking expected policy state. App refresh subsequently reads state, but its recovery success presentation can be set first. No stored kind is provided by the current resolve/claim/refund entry constructors.
- Claim/refund UI text asserts transferred/returned value without independently proving outgoing finalized effects.
- App.vue:116 contains a Historical V1 panel in its ordinary developer disclosure. ui_redesign.test.mjs:55 currently **requires** that historical presentation. This test must be changed to rendered V2-only expectations, not silently removed.

The source audit covered contracts/nimbuspact.py; all frontend library files and App.vue; direct/frontend/integration tests; deploy/deployScript.ts; configuration, manifests and both lockfiles; README, app README, docs; and .github/workflows/ci.yml. Existing scripts are the deployment helper and Python tools; app/scripts was empty. The integration smoke test deploys a contract and is not a read-only live proof. It was not pointed at Bradbury.

## Release boundary

No actual V2 economic defect, source/deployment mismatch, or runtime incompatibility was demonstrated. The missing version getter is an attestation-interface limitation, not evidence that funding/refund logic needs replacing. The V2 contract was not changed or redeployed.
