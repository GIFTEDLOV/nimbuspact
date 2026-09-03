# NimbusPact V2

> Parametric weather cover where GenLayer consensus turns a fixed public weather observation into a finalized payout or recovery decision.

NimbusPact is a Testnet Bradbury demonstration, not mainnet insurance or a regulated insurance product.

## Release status

The V2 source and controlled state-machine coverage are in this repository. A new compatible deployment and the browser funding proof are release gates; this README does not claim either until the transaction evidence is recorded below.

| Surface | Value |
| --- | --- |
| Repository | [github.com/GIFTEDLOV/nimbuspact](https://github.com/GIFTEDLOV/nimbuspact) |
| Historical V1 application | [nimbuspact.vercel.app](https://nimbuspact.vercel.app) |
| Target network | Testnet Bradbury after the matching v0.6 stack is promoted |
| RPC | `https://rpc-bradbury.genlayer.com` |
| Current V2 contract | Pending separately finalized deployment |
| Current V2 app | Pending V2 funding proof |

## Changes after reviewer feedback

1. Live policy funding now has one coherent GenLayer V2 fee lifecycle implementation. The payable `value` is exactly the escrow payout, while the measured protocol-fee deposit is passed separately; V2 funding remains gated until the matching stack is available on Bradbury.
2. Wallet, RPC, fee, contract, consensus, and execution failures cross one recursive normalization boundary. Structured errors retain bounded diagnostics and never become an unreadable object string.
3. The Intelligent Contract derives UTC observation boundaries from its deterministic transaction timestamp. It rejects retroactive creation and rejects early resolution on-chain.
4. The escrow state machine now has `REFUNDED`, creator refunds for `NOT_TRIGGERED`, bounded retry for `DATA_UNAVAILABLE`, and a deterministic delayed fail-safe refund after the recovery grace period.

## Product and trust boundary

A creator funds a stated payout for a bounded weather condition. The contract stores the location, UTC date window, trigger, threshold, beneficiary, and exact payout. Validators independently inspect the same fixed Open-Meteo Archive request. Strict-equivalence consensus records `TRIGGERED`, `NOT_TRIGGERED`, or `DATA_UNAVAILABLE`.

Open-Meteo is an external source. Validator agreement establishes agreement over the evidence and its deterministic interpretation; it is not a provider signature or proof that the provider is truthful.

## Observation-window rules

Dates are valid UTC calendar dates from 2000 through 2100. The inclusive window is at most 31 days. The contract stores:

- `observation_start_timestamp`: UTC midnight at the start date;
- `observation_end_timestamp`: UTC midnight immediately after the end date.

At `create_policy`, the deterministic GenLayer transaction timestamp must be strictly before `observation_start_timestamp`. This prevents retroactive weather insurance. At `resolve_policy`, the deterministic transaction timestamp must be at or after `observation_end_timestamp`; otherwise the contract raises `Observation window is still open` without changing policy state.

The frontend displays the same UTC boundary and disables early resolution as a usability measure. The contract remains authoritative for direct callers.

## Escrow economics and state machine

The creator sends exactly `payout_amount` as the payable call value. The protocol fee is a separate deposit estimated from the current fee policy and fee profile. The UI labels both amounts and shows the wallet requirement as `escrow + network deposit`; it never adds the fee deposit to escrow.

The state machine is:

```text
ACTIVE -> TRIGGERED -> CLAIMED
ACTIVE -> NOT_TRIGGERED -> REFUNDED
ACTIVE -> DATA_UNAVAILABLE -> retry -> TRIGGERED -> CLAIMED
ACTIVE -> DATA_UNAVAILABLE -> retry -> NOT_TRIGGERED -> REFUNDED
ACTIVE -> DATA_UNAVAILABLE -> grace expires -> REFUNDED
```

`DATA_UNAVAILABLE` is evidence failure, not a positive weather result. The first unavailable result records the failure digest and opens a 24-hour deterministic recovery grace period. Retries keep the original immutable terms: source construction, location, dates, threshold, metric, and consensus rules. A retry is allowed only while the observation window is closed and grace remains open. A successful retry removes the unavailable recovery path permanently.

The creator may pull the exact stored payout through `refund_policy` after `NOT_TRIGGERED`, or after the unavailable recovery grace expires while the policy remains `DATA_UNAVAILABLE`. Only the stored creator is the destination. The beneficiary cannot claim a non-triggered policy. A triggered claim and a creator refund both require a contract solvency guard, set the terminal state before emitting a finalized-safe transfer, and are one-time operations.

## Public contract methods

- `create_policy(location_name, latitude, longitude, start_date, end_date, trigger_type, threshold, beneficiary, payout_amount)` — payable write; `gl.message.value` must equal `payout_amount`.
- `resolve_policy(policy_id)` — write; resolves after the complete UTC window and retries unavailable evidence during recovery.
- `claim_payout(policy_id)` — beneficiary-only write from `TRIGGERED`.
- `refund_policy(policy_id)` — creator-only write from `NOT_TRIGGERED`, or from expired `DATA_UNAVAILABLE` recovery.
- `get_policy(policy_id)` — view.
- `get_policies()` — view.
- `get_policy_ids()` — view.
- `get_policy_count()` — view.

Supported triggers:

| Trigger | Metric | Bounds |
| --- | --- | ---: |
| `HEAVY_RAIN` | `PRECIPITATION_MM` | 0 to 1000 mm |
| `EXTREME_HEAT` | `TEMPERATURE_MAX_C` | -100 to 100 °C |
| `SEVERE_STORM` | `WIND_MAX_KMH` | 0 to 500 km/h |

## Frontend transaction flow

The application uses the pinned GenLayer V2 release candidate at commit `8bc7c73cf26e57473804bdd1caad17f99d49d4ae`. Its write flow is:

```text
precondition read -> live fee estimate -> wallet signing -> broadcast once
-> persist hash -> wait for FINALIZED -> require FINISHED_WITH_RETURN
-> read expected contract state
```

`ACCEPTED` is provisional. Polling timeouts and ambiguous interruptions preserve the original hash; the app reconciles it instead of broadcasting a replacement. If a wallet/RPC call returns no hash, a persistent action lock and exact-policy reconciliation prevent an automatic duplicate funding attempt. The error panel exposes a user-facing action and expandable technical diagnostics.

## Network compatibility gate

The official v0.6 migration line is a coordinated release family: v2.0 RC `genlayer-js`, matching node/consensus, CLI, Studio, and fee-profile tooling. The current Bradbury endpoint was probed read-only during this remediation: its fee-manager quote calls reverted, and the V2 SDK could not read the historical V1 contract through the endpoint's legacy GenVM path. That evidence is recorded in [`docs/rejection-remediation/bradbury-compatibility.json`](docs/rejection-remediation/bradbury-compatibility.json). No V2 write or GEN spend was attempted after this incompatibility was established. The V2 frontend must be pointed at a matching promoted Bradbury stack before deployment or live funding proof.

Authoritative references: [Transaction Context](https://docs.genlayer.com/developers/intelligent-contracts/features/transaction-context), [Value Transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers), [Fees and Transaction Policy](https://docs.genlayer.com/developers/decentralized-applications/fees-and-transaction-kit), [Fee Profiling and Estimation](https://docs.genlayer.com/developers/decentralized-applications/fee-profiling-and-estimation), [Transaction Kit Integration](https://docs.genlayer.com/developers/decentralized-applications/transaction-kit-integration), [Fee Outcomes and Debugging](https://docs.genlayer.com/developers/decentralized-applications/fee-outcomes-and-debugging), and [Consensus v0.6 Migration](https://docs.genlayer.com/developers/consensus-v06-migration).

## Fee profile and fee policy

The official GenLayer fee model separates protocol fees from payable user value. A supported fee-profile run should measure these representative branches:

- `create_policy`;
- normal `resolve_policy`;
- `resolve_policy` returning `DATA_UNAVAILABLE`;
- retry to `TRIGGERED`;
- `claim_payout` with its emitted transfer;
- `refund_policy` with its emitted transfer.

The installed local `gltest` in this workspace predates the `--fee-profile` option, so no fee constants are checked in or invented. The V2 frontend uses the SDK's live target-write estimator when the matching network exposes the fee policy, and deployment must use a supported fee-aware tool/profile before signing. When the compatible profiler is available, commit its generated profile and rerun it whenever the contract, GenVM, or fee policy changes.

## Historical rejected V1 evidence

The previously submitted deployment is preserved as historical evidence and is not represented as V2:

| Item | Rejected V1 value |
| --- | --- |
| Contract | `0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934` |
| Deployment transaction | `0xf02ddbb1fa117ad1dbbabf32dfc41f912fb7d4ac42eda77e9f5130c8186610db` |
| V1 source SHA-256 | `1a6386e22ffc60d8beae3640569bf25ec6582c7896bb565bb1b161b96810e310` |
| Evidence | [`docs/live-proof/bradbury-smoke.json`](docs/live-proof/bradbury-smoke.json) |

That proof remains useful historical evidence for the old create/resolve/claim path and its reverted wrapper attempt. It does not prove the V2 source or V2 funding flow. The rejected V1 lacked contract-side observation enforcement, retry/refund recovery, and fee-aware browser funding.

The preserved reverted wrapper transaction is `0xbe2fd099ec7f1b52db4a412bd2b587006c237a6ccf6aa516467f430d695c6d6b`; it is disclosed as a failed historical attempt, not a successful settlement.

## Controlled integration proof versus live Bradbury proof

The direct suite uses deterministic transaction timestamps and controlled weather responses to prove every V2 transition, including the 24-hour grace boundary. This is **controlled integration proof**, not a live weather assertion.

The **LIVE BRADBURY PROOF** section below is intentionally empty until a new deployment is finalized and one funded policy is created through the public V2 browser flow with a funded test account. A CLI write or direct RPC call is not a substitute for that frontend proof.

### LIVE BRADBURY PROOF

| Evidence | Value |
| --- | --- |
| New V2 contract | Pending |
| Deployment transaction | Pending |
| Deployment status | Pending `FINALIZED / FINISHED_WITH_RETURN / AGREE` |
| Preview / production URL | Pending |
| Browser wallet | Pending |
| Live create transaction | Pending |
| Live policy ID | Pending |
| Escrow balance check | Pending |
| Fee quote verification | Pending |

## Local checks

```powershell
python -m pip install -r requirements.txt
npm ci
npm ci --prefix app
npm run contract:lint
python -m pytest tests/direct -v
npm run test:frontend
npm run frontend:typecheck
npm run frontend:build
```

The integration smoke test requires a running compatible Studio or explicitly configured network:

```powershell
gltest tests/integration/ -v -s
```

The repository does not store private keys. Public frontend configuration uses `VITE_CONTRACT_ADDRESS`, `VITE_GENLAYER_NETWORK`, and `VITE_GENLAYER_RPC_URL` only.

## Security review checklist

- Creation after the observation start is rejected by deterministic contract time.
- Direct early resolution is rejected without state mutation.
- A creator cannot escape a successful `TRIGGERED` retry with a refund.
- `NOT_TRIGGERED` cannot be claimed by the beneficiary.
- Unavailable evidence cannot become a positive trigger without a successful retry.
- Source construction and all policy terms remain immutable after funding.
- Claim/refund transitions are terminal, creator/beneficiary authorized, solvency-guarded, and duplicate-safe.
- Fees are never presented as escrow.
- Hash persistence prevents a frontend timeout from causing duplicate funding.
- Structured thrown values are recursively normalized and retained as diagnostics.

## Repository layout

- `docs/rejection-remediation/bradbury-compatibility.json` — read-only Bradbury/V2 compatibility evidence and raw error capture.

- `contracts/nimbuspact.py` — V2 consensus-critical policy, evidence, timing, retry, refund, and payout state machine.
- `app/src/lib/nimbuspact.ts` — V2 client, exact payable value, live fee estimate, hash recovery, and policy actions.
- `app/src/lib/receiptStatus.ts` — finality/execution classification and the single error-normalization boundary.
- `tests/direct/test_nimbuspact.py` — deterministic V2 transition and economic regression coverage.
- `tests/frontend/receipt_status.test.mjs` — receipt, structured-error, and escrow-versus-fee regressions.
- `docs/live-proof/bradbury-smoke.json` — preserved rejected V1 evidence.

NimbusPact is MIT-licensed; see [`LICENSE`](LICENSE).
