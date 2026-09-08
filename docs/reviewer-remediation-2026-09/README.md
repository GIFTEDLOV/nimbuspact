# NimbusPact reviewer remediation — current evidence

## CURRENT PRODUCTION CONTRACT

0x055F97140CE35FD1e656ebb3D204952A46646681

## REJECTED HISTORICAL V1

0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934

V1 remains preserved as rejected historical evidence under docs/history/v1. It is not the production contract and is not an active runtime selection.

## Current deployment

Production is https://nimbuspact.vercel.app on testnetBradbury, chain 4221, using https://rpc-bradbury.genlayer.com. The current Vercel deployment is READY and its deployed source SHA is 4b6cd393ac95d60e7ad69ae864fb423a69ba6a74. The deployed JavaScript bundle resolves the V2 address above; the V1 literal is retained only as an inert rejected-address guard.

The machine-readable current attestation is deployment/production-attestation-current.json. The older production-attestation.json is preserved as the original stale V1-era capture and must not be read as current status. The earlier V2 capture production-attestation-final.json is also preserved.

## Reviewer-requested live proof

The existing early-resolution write for policy p-1 was broadcast once as protocol transaction 0xe92dc923a045911f896fff3cb5a64e640bc9234d2a0ebd38142bc5c49d140b2c. It is now FINALIZED with FINISHED_WITH_ERROR and the exact error UserError: Observation window is still open. The immediate same-policy readback shows status ACTIVE, resolution_attempts 0, data_unavailable_since 0, withdrawn false, refunded false, empty resolution/evidence fields, and escrow unchanged at 0.01 GEN.

The existing refund write for p-1 was broadcast once as protocol transaction 0xcfc1a9dc723365898b40c182e03fbd3f5b017edc6d4583b964d56c049cb5e37d. It is FINALIZED with FINISHED_WITH_RETURN. The final state is REFUNDED, withdrawn true, refunded true, escrow zero. Independent GEN-effect evidence is recorded as the finalized parent payout message to the creator plus the finalized contract-balance delta from 0.01 GEN to zero. No child receipt was exposed by the configured runtime/RPC, so none is claimed.

Full raw receipts, traces, state readbacks, and balance records remain in the transaction directories. The concise index is reviewer-manifest.json.

## Evidence navigation

- Current production: deployment/production-attestation-current.json
- Current deployment capture: deployment/production-verification.md
- Early final reconciliation: transactions/early-resolution/reconciled-final.json
- Early before/after readback: transactions/early-resolution/reconciled-current-readback.json
- Early raw transaction evidence: transactions/early-resolution/0xe92dc923a045911f896fff3cb5a64e640bc9234d2a0ebd38142bc5c49d140b2c/
- Refund final effect reconciliation: transactions/refund/reconciled-effect-final.json
- Refund raw transaction evidence: transactions/refund/
- Reviewer manifest: reviewer-manifest.json
- Historical V1 evidence: ../history/v1/README.md
- Prior withheld response draft: source-remediation/prior-portal-draft-NOT-FOR-SUBMISSION.md

## Scope

No contract source was changed. No V3 was created. No new deployment was made. No replacement early-resolution or refund write was broadcast.
