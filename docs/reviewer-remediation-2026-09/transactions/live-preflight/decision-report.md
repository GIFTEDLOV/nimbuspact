# NimbusPact live transaction preflight (read-only)

Captured from Testnet Bradbury through the deployed V2 contract `0x055F97140CE35FD1e656ebb3D204952A46646681` at `2026-09-06T21:45:44.770Z`. Contract reads use `latest-final`; the chain clock is the latest Bradbury block timestamp. No wallet signing or transaction broadcast was performed.

The initial raw capture in the parent directory was retained unchanged. The `finalized/` subdirectory is the canonical state read because each contract view there explicitly uses `transaction_hash_variant: latest-final`.

## Chain and p-1

- Chain ID: `0x107d` / `4221`
- Latest block: `0x13f2aa0`
- Latest block timestamp: `1788731142` / `2026-09-06T21:45:42Z`
- Contract balance: `10000000000000000` wei / `0.01 GEN`
- Policy enumeration: count `1`; IDs `["p-1"]`
- Creator: `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5`
- Beneficiary: `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5`
- Status: `ACTIVE`
- Payout: `0.01 GEN` (`10000000000000000` wei)
- Observation start: `1788566400` / `2026-09-05T00:00:00Z`
- Observation end: `1788739200` / `2026-09-07T00:00:00Z`
- Seconds until end: `8058` (`2h 14m 18s` at the captured chain timestamp)
- Window currently open: `YES`
- `withdrawn`: `false`
- `refunded`: `false`
- `resolution_attempts`: `0`
- `data_unavailable_since`: `0`
- `escrow_funded`: not a stored Policy field; inferred `true` because p-1 is ACTIVE, neither withdrawn nor refunded, and the contract balance equals its 0.01 GEN payout
- `settled`: not a stored Policy field; inferred `false`
- Settlement recipient/reason: not stored/exposed for this ACTIVE policy

## Early-resolution decision

At the contract level, p-1 is a valid early-resolution rejection target while the window is open. A `resolve_policy("p-1")` call before `2026-09-07T00:00:00Z` would reach the on-chain observation-window guard. It must not be called in this phase.

There is no supported production UI action that can perform that early rejection now. The p-1 card renders `Observation in progress`; the `Resolve` button is rendered only after the window closes, and the frontend precondition also rejects an early call. After the window closes, the supported action is `Resolve`, but that would be a legitimate adjudication attempt rather than an early-window rejection.

## Recovery candidates

No existing recovery candidate is currently eligible. The contract exposes `get_policy_count`, `get_policy_ids`, `get_policies`, and `get_policy`; enumeration returned only p-1.

| policy | creator | status | observation end | attempts | data unavailable since | refund now | retry now | reason |
|---|---|---|---|---:|---:|---|---|---|
| p-1 | creator above | ACTIVE | 2026-09-07T00:00:00Z | 0 | 0 | NO | NO | Observation window is still open; no resolution outcome exists |

## Smallest legitimate new policy if needed

No new policy is required immediately for the early-rejection target: p-1 is already active. If a new policy becomes necessary after p-1's honest resolution outcome, the smallest valid production inputs are:

- Location: `Lagos Island`
- Latitude: `6.5244`
- Longitude: `3.3792`
- Observation start: next future UTC date, `2026-09-07`
- Observation end: `2026-09-07` (minimum one-calendar-day window; start and end may be equal)
- Condition: `HEAVY_RAIN`
- Threshold: `50` mm (the existing default; no semantic outcome is being forced)
- Beneficiary: creator `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5` if creator-controlled refund proof is desired
- Protocol minimum payout: strictly greater than zero; frontend/parser and contract accept `1` wei (`0.000000000000000001 GEN`). A practical non-dust proof amount would be `0.01 GEN`.
- Approximate wait before legitimate resolution if created at the captured time: until `2026-09-08T00:00:00Z`, about `26h 14m 18s`, plus finalization latency
- Honest outcomes after the one allowed resolution: `TRIGGERED`, `NOT_TRIGGERED`, or `DATA_UNAVAILABLE`

The weather source, location, dates, and threshold are ordinary user inputs. No input is selected to falsify or force an outcome.

## Production UI actions

- **Create/fund:** connect the creator wallet; click `Create cover` or `New cover`; complete `Condition`, `Payout`, and `Review`; click `Fund cover`. The frontend submits one payable `create_policy` call with the exact payout as `msg.value`.
- **Resolve:** on a closed `ACTIVE` card, click `Resolve`. p-1 currently shows `Observation in progress`, so this action is unavailable until the window closes.
- **Retry:** on a closed `DATA_UNAVAILABLE` card during its 24-hour recovery period, click `Retry verification`. The UI and contract reject retries after that period.
- **Refund:** with the creator wallet connected, click `Claim refund` on a `NOT_TRIGGERED` policy, or on `DATA_UNAVAILABLE` only after the 24-hour recovery period. A `TRIGGERED` policy instead exposes `Claim payout` to its beneficiary.

## Evidence files

- `normalized.json`
- `chain-time.json`
- `contract-balance.json`
- `policies/count.json`
- `policies/ids.json`
- `policies/all.json`
- `policies/p-1.json`
- `rpc/` contains the raw Bradbury responses for every read

No transaction hash exists from this preflight because no transaction was submitted.
