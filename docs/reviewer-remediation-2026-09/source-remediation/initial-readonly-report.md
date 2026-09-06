# September reviewer remediation: blocked evidence pass

**The reviewer requirements are not complete.** The production bundle is configured with the rejected historical address and fails the exact-V2 safety guard. Funding is independently proven; early rejection and refund/retry are not live-proven. The missing creator wallet, Vercel credentials, and browser surface triggered the user's read-only stop rule. Product source and historical evidence were left unchanged; nothing was committed, pushed, deployed, or broadcast.

| Identity | Evidence |
| --- | --- |
| Production | https://nimbuspact.vercel.app |
| Intended V2 | `0x055F97140CE35FD1e656ebb3D204952A46646681` |
| Network | Testnet Bradbury, RPC https://rpc-bradbury.genlayer.com, chain 4221 |
| Expected version | 2.0.0, **not returned on-chain**: version() is absent and rejects |
| Audited/source HEAD | `e27ebeb677f3ca8ad5f04b31b1a7fd659d9792c7`, master |
| GitHub Production deployment | 6268233543, successful status for that SHA |
| Immutable deployment | https://nimbuspact-8hgdjvssm-kolofahkelvin16-6437s-projects.vercel.app |
| Source provenance | GitHub deployment/status + byte-identical HTML/JS/CSS at immutable URL and production alias |
| Vercel deployment UID | Not exposed by saved public evidence; do not confuse GitHub deployment ID or x-vercel-id request header with a dpl_ UID |

## Reviewer matrix

| Reviewer requirement | Implementation | Production evidence | Tx hash | Consensus status | Execution result | State readback | Artifact path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Correct V2 frontend | Exact address/RPC/network allowlist exists | **FAIL:** bundle environment uses rejected V1; operational address becomes empty | — | — | — | No operational UI target | [attestation](deployment/production-attestation.json), [dataflow](deployment/bundle-config-analysis.json) |
| Version 2.0.0 read | No version() method | Live view rejected; both deployed and local source lack getter | Read only | N/A | View error | No version returned | [version](deployment/version-read.json), [parity](deployment/source-parity.json) |
| Remove stale V1 normal UI | Historical V1 remains in App.vue developer disclosure | Historical panel in render code; actual browser rendering unavailable | — | — | — | Not removed | [audit](source-audit.md), [access](access-blockers.json) |
| Funding | Payable exact-value create_policy | FINALIZED plus successful execution and funded state | `0xef9d035c4d7714774fda42efa72b07d02a89dda851d8ab7dac5ac8366c2e3c56` | FINALIZED | FINISHED_WITH_RETURN | p-1 ACTIVE, 0.01 GEN, withdrawn=false, refunded=false | [funding](transactions/funding/0xef9d035c4d7714774fda42efa72b07d02a89dda851d8ab7dac5ac8366c2e3c56/verification.md) |
| Early on-chain rejection | Guard before web and mutation; Direct Mode tests pass | NOT BROADCAST: existing p-1 suitable at read time; creator wallet unavailable | None | Unproven | Unproven | Precondition only; no before/after rejection claim | [precondition](transactions/early-resolution/precondition.json) |
| Finalized refund/retry | NOT_TRIGGERED refund and bounded unavailable retry/refund implemented | NOT BROADCAST: only p-1 ACTIVE and window still open; creator unavailable | None | Unproven | Unproven | No eligible recovery policy | [eligibility](transactions/recovery/eligibility.json) |
| Clear structured errors | Recursive bounded error normalization | Automated tests only in this pass | — | — | — | — | [checks](checks.md) |

Raw RPC responses are under [rpc/](rpc/). SDK transaction structures are explicitly labelled as decoded evidence. Funding `all-data.json` independently contains submitted value and full rounds. Five revealed AGREE votes are supported for this funding transaction only. On-chain code parity comes from the finalized gen_getContractCode object request and finalized deployment payload; checkout CRLF explains the byte-hash difference.

## Limitations and next authorized work

1. Restore local Vercel authentication for the existing project and expose the creator wallet/browser session, as specified in [access-blockers.json](access-blockers.json). Do not provide keys in chat.
2. Correct the existing project's production environment to the exact V2 address, remove the ordinary Historical V1 panel, and add rendered/configuration regression coverage. Correct frontend finalized-state reconciliation and transfer wording documented in [source-audit.md](source-audit.md). Do not redesign or redeploy the contract merely for a version label.
3. Re-read state before any write. At capture p-1 closes `2026-09-07T00:00:00Z`. An early rejection must be submitted before its actual window closes; after that, a new legitimately prospective policy may be needed. No policy was created here.
4. No current NOT_TRIGGERED or DATA_UNAVAILABLE policy exists. Use one honest resolution after a legitimate closed window, preserve the genuine result, and then prove an eligible refund or one legitimate retry. No semantic result chasing or clock bypass.
5. A refund requires both terminal policy state and actual outgoing finalized effect evidence. None was attempted or claimed.
6. `version() = 2.0.0` cannot be attested for this deployment. It is an interface limitation, not a source mismatch. Document it transparently rather than inventing a return or changing the target address.
7. History remains at [../live-proof/bradbury-smoke.json](../live-proof/bradbury-smoke.json) and [../rejection-remediation/](../rejection-remediation/). The requested move to docs/history/v1 is pending; history was not deleted. This new package contains only current V2 proof, explicit historical context, and failures/blockers.

See [preflight](preflight.md), [official URLs/headings](official-documentation.md), [audit](source-audit.md), [checks](checks.md), and [proposed portal response](portal-response.md). Root README was not changed because this pass stopped at read-only evidence collection; its earlier production claims should not override this attestation.
