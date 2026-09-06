# September reviewer remediation

Source remediation is prepared: the current UI omits the historical V1 panel, the exact-V2 safety guard is retained, and stack-frame text no longer misclassifies polling timeouts. Deployment and live-write proof require separate authorization. No acceptance response is drafted until every required production and live proof exists.

| Reviewer requirement | Implementation / evidence | Status |
| --- | --- | --- |
| Production URL | https://nimbuspact.vercel.app | Existing alias |
| Deployed source SHA | e27ebeb677f3ca8ad5f04b31b1a7fd659d9792c7; GitHub deployment 6268233543 and identical immutable HTML/JS/CSS | Previous production proven |
| Exact V2 contract | 0x055F97140CE35FD1e656ebb3D204952A46646681 | Contract/source parity proven |
| Bradbury | https://rpc-bradbury.genlayer.com / chain 4221 | Proven |
| Operational V2 config | Current saved production bundle contains rejected V1 environment; guard blocks it | Deployment correction pending |
| No stale V1 UI | Removed from App.vue; actual Vue server-rendering test with V2 config | Source verified; live production pending |
| Funding tx | 0xef9d035c4d7714774fda42efa72b07d02a89dda851d8ab7dac5ac8366c2e3c56 | FINALIZED |
| Funding execution | FINISHED_WITH_RETURN | Proven |
| Funding state | p-1 ACTIVE, payout 0.01 GEN, withdrawn=false, refunded=false; matching contract balance | Finalized readback proven |
| Funding validators | Five revealed AGREE votes, full rounds and raw RPC responses | 5/5 proven for this tx |
| Early rejection tx / status / execution | No write until creator wallet available | Not broadcast |
| Early rejection unchanged state | Initial precondition saved; fresh precondition required | Not yet proven |
| Refund/retry tx / status / execution | No eligible recovery state at initial capture; re-read before writes | Not broadcast |
| Recovery resulting state | No recovery execution | Not yet proven |
| Actual outgoing GEN transfer | No settlement attempted | Not yet proven |

## Evidence navigation

- [Production attestation](deployment/production-attestation.json): preserved original production failure, not an attestation of corrected deployment.
- [Funding verification](transactions/funding/0xef9d035c4d7714774fda42efa72b07d02a89dda851d8ab7dac5ac8366c2e3c56/verification.md): transaction, execution, value, validator rounds and finalized state. Original raw evidence is unchanged.
- [Contract/source parity](deployment/source-parity.json): finalized deployed code matches source after CRLF normalization. No on-chain version is claimed; the contract has no version() method.
- [Source continuation](source-remediation/README.md): changes, regression results and release boundary.
- [Initial audit](source-audit.md), [official documentation](official-documentation.md), [initial preflight](preflight.md), [initial checks](checks.md).
- [Historical V1 evidence](../history/v1/README.md): moved intact out of live-proof; historical failed proof retained.
- [Acceptance-response gate](portal-response.md): no final response until production and required live proofs exist.

## Remaining execution gates

Use only the existing Vercel project prj_L18BJynNSaKWW0y82hLJBiT9HN7H. Set production (and shared preview) VITE_CONTRACT_ADDRESS to the exact V2 address, build committed master, wait for READY and re-attest the alias. An inert V1 rejection literal in the bundle is expected and permitted.

Expose the existing creator wallet 0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5 through its authorized local/browser session. Do not supply private keys or tokens in chat. Re-read p-1: its original observation end is 2026-09-07T00:00:00Z. If that time has passed, a new minimal prospective policy is required for an early-rejection proof through corrected production. Broadcast each operation once, save its hash immediately, and reconcile that same hash. An early-window failure must be labelled FINALIZED_REJECTION, never success.

For recovery, use eligible genuine state, or one honest closed-window resolution. Preserve DATA_UNAVAILABLE or TRIGGERED if that is the real result; do not chase NOT_TRIGGERED. Prove outgoing GEN effects independently before claiming a completed refund.

The source audit also records broader existing state-readback/transfer-presentation limitations. This scoped continuation does not rewrite those transaction paths. Direct/SSR tests are not live weather, validator-rejection, browser-wallet, or transfer proof. Local Studio is unavailable; the deployment-based integration smoke test was not redirected to Bradbury.
