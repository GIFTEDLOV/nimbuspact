# NimbusPact

> Parametric weather cover where GenLayer consensus turns a fixed public weather observation into a finalized payout decision.

[![CI](https://github.com/GIFTEDLOV/nimbuspact/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/GIFTEDLOV/nimbuspact/actions/workflows/ci.yml) [![Network: Testnet Bradbury](https://img.shields.io/badge/network-Testnet%20Bradbury-7dff5b.svg)](https://www.genlayer.com/)

![NimbusPact landing page showing the finalized weather-cover proof snapshot and direct policy workspace](docs/assets/screenshots/nimbuspact-landing.png)

## Live links

| Surface | Verified value |
| --- | --- |
| Application | [nimbuspact.vercel.app](https://nimbuspact.vercel.app) |
| Repository | [github.com/GIFTEDLOV/nimbuspact](https://github.com/GIFTEDLOV/nimbuspact) |
| Network | Testnet Bradbury (`testnetBradbury`) |
| RPC | [`rpc-bradbury.genlayer.com`](https://rpc-bradbury.genlayer.com) |
| Intelligent Contract | `0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934` |
| Live proof | [`docs/live-proof/bradbury-smoke.json`](docs/live-proof/bradbury-smoke.json) |

This release is Testnet Bradbury only. It is not mainnet insurance coverage, and no external organization is represented as having audited or certified NimbusPact.

## 1. Product

NimbusPact is a parametric weather-cover application on GenLayer. A policy creator funds a stated payout for a bounded weather condition, GenLayer validators independently fetch the same fixed public weather source, and the Intelligent Contract deterministically records whether the configured threshold was crossed. A beneficiary can claim only after a triggered result reaches successful finalized state.

The representative Testnet Bradbury workflow is live-proven end to end: funded policy creation, weather resolution, finalized beneficiary claim, and external GEN settlement.

- Public application: https://nimbuspact.vercel.app
- GitHub repository: https://github.com/GIFTEDLOV/nimbuspact
- Network: Testnet Bradbury
- RPC: `https://rpc-bradbury.genlayer.com`
- Deployed contract: `0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934`

## 2. Problem

A claimant, application frontend, project backend, weather-data submitter, or single application operator should not be able to unilaterally decide whether a real-world weather trigger occurred and therefore whether a payout is eligible.

NimbusPact moves that decision boundary into a GenLayer Intelligent Contract. The contract fixes the policy terms and evidence request, validators independently execute the external-data inspection, and GenLayer consensus determines the finalized contract state from which settlement eligibility follows.

## 3. The solution

NimbusPact makes the policy terms explicit before money moves: a location, a bounded observation window, one supported metric, a threshold, a beneficiary and an exact GEN payout. The deployed Intelligent Contract owns the trigger decision and the payout gate; the frontend is a transparent client for reads, wallet requests and transaction recovery.

That separation matters. A project operator can present the interface, but cannot edit a funded policy's weather terms or mark it triggered. A beneficiary can claim only from the finalized `TRIGGERED` state, and a second claim is rejected after `CLAIMED` / `withdrawn=true`.

## 4. Why GenLayer

The policy decision depends on data outside the chain. NimbusPact uses GenLayer's nondeterministic web access inside the Intelligent Contract to fetch the fixed Open-Meteo Archive request and `gl.eq_principle.strict_eq` to require equivalent validator output.

The weather calculation itself is deliberately bounded and deterministic: the contract validates the provider response, normalizes the requested daily metric, calculates the maximum value over the policy window, compares it with the stored threshold, and produces one of three resolution states:

- `TRIGGERED`
- `NOT_TRIGGERED`
- `DATA_UNAVAILABLE`

GenLayer is therefore central to the product workflow: validators independently execute the real-world data read, consensus finalizes the decision, and the resulting Intelligent Contract state gates the beneficiary payout.

Consensus is not treated as source authentication. Open-Meteo remains an external dependency; validator agreement establishes agreement over the evidence they received and the contract's interpretation of it, not cryptographic proof that the provider is truthful or that the provider authored the data.

## 5. Product walkthrough

1. A policy creator chooses a location label, latitude, longitude, observation window, supported weather trigger, threshold, beneficiary, and payout amount.
2. `create_policy` validates and canonicalizes those fields. The payable call must fund the contract with exactly the stated payout amount.
3. The contract constructs a fixed Open-Meteo Archive API URL from the canonical coordinates and dates.
4. After the observation window has closed, `resolve_policy` asks validators to fetch the same URL. The contract checks HTTP/body shape, coordinates, dates, daily arrays, metric bounds, and deterministic evidence normalization.
5. `gl.eq_principle.strict_eq` requires equivalent validator output for the structured decision/evidence payload.
6. The policy becomes `TRIGGERED`, `NOT_TRIGGERED`, or `DATA_UNAVAILABLE`, and a SHA-256 digest of the normalized decision evidence is stored.
7. Only the beneficiary may call `claim_payout`, and only when the finalized policy state is `TRIGGERED` and the payout has not already been claimed.
8. The claim checks contract solvency, emits the native GEN transfer on finalization, and records `CLAIMED` / `withdrawn=true`.

The public frontend also blocks its Resolve control until the policy's observation end date has fully closed in UTC. This is a user-interface safeguard; the deployed contract itself does not independently know whether wall-clock observation time has completed.

### Lifecycle and recovery

The UI exposes the live Bradbury policy list and policy detail, including the evidence URL, evidence digest, observed value, resolution result, beneficiary and payout state. Each write follows:

`PRECONDITION READ -> BROADCAST ONCE -> SAVE HASH -> RECONCILE THE SAME HASH -> REQUIRE FINALIZED + FINISHED_WITH_RETURN -> READ EXPECTED STATE`

`ACCEPTED` is provisional. Refreshes, polling timeouts and ambiguous network interruptions keep the original transaction hash recoverable; the frontend does not automatically rebroadcast a replacement transaction.

The representative live proof uses `p-1`: create, resolve, then beneficiary claim. The application does not fabricate that policy into the live policy list; its hero proof snapshot is a clearly labelled release-evidence summary, while the policy desk reads the deployed contract directly.

## 6. Trigger model

The deployed contract supports exactly three trigger types. It reads the corresponding UTC daily Open-Meteo field for every date in the inclusive observation window, takes the maximum, and triggers when `observed maximum >= threshold`.

| Trigger type | Stored metric | Open-Meteo daily field | Threshold bounds |
| --- | --- | --- | ---: |
| `HEAVY_RAIN` | `PRECIPITATION_MM` | `precipitation_sum` | 0 to 1000 mm |
| `EXTREME_HEAT` | `TEMPERATURE_MAX_C` | `temperature_2m_max` | -100 to 100 C |
| `SEVERE_STORM` | `WIND_MAX_KMH` | `wind_speed_10m_max` | 0 to 500 km/h |

Coordinates are canonicalized to four decimal places and thresholds to three decimal places. Dates must be valid `YYYY-MM-DD` values from 2000 through 2100. The inclusive observation window is at most 31 days.

## 7. Evidence model

The Intelligent Contract builds the Open-Meteo Archive API request from the stored canonical latitude, longitude, start date and end date. The request fixes `daily=precipitation_sum,temperature_2m_max,wind_speed_10m_max` and `timezone=UTC`. Every validator independently performs the nondeterministic HTTP read; the contract's validation and normalization after the read are deterministic.

The response must be HTTP 200 JSON with numeric source coordinates within 0.5 degrees, a `daily.time` array and the requested metric array, exactly the expected number of dates, every requested date present, and values inside the metric bounds. The normalized evidence records provider, fixed URL, canonical coordinates/dates, metric and three-decimal daily values. `strict_eq` requires equivalent structured decisions and normalized evidence before the state transition is accepted.

The contract stores a SHA-256 digest of the normalized evidence. This is an integrity commitment to the decision payload, not a provider signature. Validator agreement does not cryptographically authenticate Open-Meteo, prove that Open-Meteo authored the response, or remove source availability/concentration risk. Request failures, non-200 responses, invalid JSON or shape, coordinate/date mismatches, and out-of-bounds values become `DATA_UNAVAILABLE`.

## 8. Architecture

- `contracts/nimbuspact.py` — deployed consensus-critical policy, evidence, resolution, and payout state machine.
- `app/` — Vue/Vite frontend using `genlayer-js` for direct reads and connected-wallet writes.
- `app/src/lib/nimbuspact.ts` — network configuration, policy-input validation, wallet flow, write lifecycle, persisted transaction hashes, and state reconciliation.
- `app/src/lib/receiptStatus.ts` — explicit finality/execution classification for transaction outcomes.
- `docs/live-proof/bradbury-smoke.json` — tracked live Bradbury evidence record.
- `tests/direct/test_release_integrity.py` — release parity guard tying the tracked contract source, deployment proof, README, frontend environment, and public method surface together.

There is no NimbusPact project backend, database, or custom oracle server in the payout decision path. The frontend reads the deployed Intelligent Contract directly.

### Fixed release identity

| Item | Value |
| --- | --- |
| Network | Testnet Bradbury |
| RPC | `https://rpc-bradbury.genlayer.com` |
| Contract | `0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934` |
| Contract/deployment SHA-256 | `1a6386e22ffc60d8beae3640569bf25ec6582c7896bb565bb1b161b96810e310` |
| Evidence source | `https://archive-api.open-meteo.com/v1/archive` |
| Public app | https://nimbuspact.vercel.app |

The deployed contract source is intentionally frozen. UI, documentation, and release-hardening changes must not silently change `contracts/nimbuspact.py`; CI verifies the tracked source hash against the live-proof record.

## 9. How to use

Install the pinned dependencies and run the full local release checks:

```powershell
python -m pip install -r requirements.txt
npm ci
npm ci --prefix app
npm run contract:lint
npm run test
npm run test:frontend
npm run frontend:typecheck
npm run frontend:build
```

Run the frontend locally:

```powershell
Copy-Item app/.env.example app/.env
npm --prefix app run dev
```

The tracked environment example targets the verified Bradbury deployment. Connect a wallet on Testnet Bradbury and use the interface to create, resolve, or claim when the current finalized policy state permits it.

Every write follows the same recovery discipline:

**precondition read → broadcast once → persist hash → reconcile the same hash → require FINALIZED + successful execution → read expected state**

`ACCEPTED` is provisional. A polling timeout, refresh, or ambiguous network interruption does not cause an automatic replacement transaction; the saved original hash remains available through **Check again**.

## 10. Verified Bradbury proof

The concise tracked evidence record is [`docs/live-proof/bradbury-smoke.json`](docs/live-proof/bradbury-smoke.json). Raw runtime receipts are intentionally not force-added to source control.

| Step | Transaction hash | Final status | Execution | Consensus / finalized state |
| --- | --- | --- | --- | --- |
| Deployment | `0xf02ddbb1fa117ad1dbbabf32dfc41f912fb7d4ac42eda77e9f5130c8186610db` | `FINALIZED / 7` | `FINISHED_WITH_RETURN` | `AGREE`, 5/5 |
| Create | `0x54d931db9b233e64863d33a1aa3150b915b99dfdca44bd3923109c7e6fa5cffd` | `FINALIZED / 7` | `FINISHED_WITH_RETURN` | `AGREE`, 5/5 |
| Resolve | `0xa1487d1c4819cb0aec4f97ddb802f861e4f19c452766527818278ba4210a92be` | `FINALIZED / 7` | `FINISHED_WITH_RETURN` | `AGREE`, 5/5; `p-1 → TRIGGERED`, observed `1.900` |
| Claim | `0x8fd84714fa7cda44eb8149aff8a6c58eafd720668ca429120d114508989d591e` | `FINALIZED / 7` | `FINISHED_WITH_RETURN` | `AGREE`, 5/5; `p-1 → CLAIMED`, `withdrawn=true` |

The representative policy beneficiary `0x6311dE989ab01Ae4Da77d36CC45d495fbCd4B7a8` received the independently verified gross settlement amount of `100000000000000000` wei (0.10 GEN). The tracked proof records the successful settlement carrier, the beneficiary balance transition, final contract balance `0`, and duplicate-claim protection.

A prior reverted EVM-wrapper claim attempt is preserved rather than hidden:

`0xbe2fd099ec7f1b52db4a412bd2b587006c237a6ccf6aa516467f430d695c6d6b`

It is disclosed historical failure evidence and is **not** counted as a successful live-proof transaction.

## 11. Security / trust model

NimbusPact separates deterministic business rules from external-data consensus.

Deterministic contract checks include:

- location-name length and format;
- latitude/longitude canonicalization and bounds;
- valid calendar dates and a maximum 31-day observation window;
- allowlisted trigger types;
- trigger-specific threshold bounds;
- exact policy funding equal to the configured payout;
- response HTTP/body/schema checks;
- source-coordinate tolerance checks;
- expected date-array shape and date matching;
- metric value bounds;
- deterministic three-decimal evidence normalization;
- beneficiary-only claim authorization;
- contract-balance solvency before payout;
- one-time withdrawal / duplicate-claim protection.

The nondeterministic boundary is the external weather read. Validators independently execute it and strict-equivalence consensus accepts the structured result. Model-generated judgment is not used to decide the weather threshold.

The stored SHA-256 evidence digest is an integrity commitment to the normalized evidence used for the decision. It is **not** a provider signature and does not authenticate Open-Meteo.

The frontend adds defense-in-depth validation before broadcast, including coordinate/date/threshold checks and rejection of a zero beneficiary address. Contract checks remain the authority when frontend validation and contract behavior overlap.

### Release integrity

CI runs contract lint/semantic validation, direct contract tests, frontend lifecycle tests, TypeScript typechecking, production frontend build, and whitespace checks. A dedicated release-integrity test additionally verifies that:

- the tracked `contracts/nimbuspact.py` SHA-256 exactly matches the source/deployment hash recorded by the Bradbury proof;
- the contract address, Bradbury RPC/network, public app, and proof identity agree across the tracked release surfaces;
- the README's documented public method surface matches the public methods declared by the contract;
- the live-proof record remains internally consistent with the finalized successful deployment and claimed representative policy.

## 12. Known limitations

These are limitations of the **currently deployed Bradbury v1**, not hidden roadmap items:

- This is a Testnet Bradbury demonstration, not a mainnet insurance product or regulated insurance offering.
- Open-Meteo Archive is a single external source dependency. Validator consensus does not remove source concentration risk or prove source authorship/truth.
- Provider unavailability or malformed evidence fails closed to `DATA_UNAVAILABLE`; it never becomes a positive trigger.
- `DATA_UNAVAILABLE` is terminal in the deployed contract because a policy can be resolved only while `ACTIVE`. There is no retry-resolution method in this deployment.
- The deployed contract has **no creator refund/reclaim path** for `NOT_TRIGGERED` or `DATA_UNAVAILABLE` policies. The exact GEN amount committed as the policy payout therefore remains locked if no beneficiary payout occurs. The frontend discloses this before funding.
- The deployed contract does not itself enforce that the real-world observation window has already elapsed before `resolve_policy` is called. The public frontend prevents premature resolution by disabling Resolve until the end date has fully closed in UTC.
- External EOA settlement is a finalized GenLayer message without a separately queryable contract-side child receipt/callback. The Bradbury smoke independently verified the settlement carrier and beneficiary balance transition.
- The historical reverted wrapper claim listed in the live proof remains part of the audit trail and is not represented as success.

Fixing the refund/retry economics would require a new contract version and a new deployment/live-proof chain. NimbusPact deliberately does not alter the already proven deployment while presenting a different source file as if it were the deployed contract.

## 13. Developer / API details

Public contract methods:

- `create_policy(location_name, latitude, longitude, start_date, end_date, trigger_type, threshold, beneficiary, payout_amount)` — payable write
- `resolve_policy(policy_id)` — write
- `claim_payout(policy_id)` — write
- `get_policy(policy_id)` — view
- `get_policies()` — view
- `get_policy_ids()` — view
- `get_policy_count()` — view

Supported trigger types and metrics:

| Trigger | Stored metric | Contract threshold bounds |
| --- | --- | ---: |
| `HEAVY_RAIN` | `PRECIPITATION_MM` | 0 to 1000 mm |
| `EXTREME_HEAT` | `TEMPERATURE_MAX_C` | -100 to 100 °C |
| `SEVERE_STORM` | `WIND_MAX_KMH` | 0 to 500 km/h |

Environment variables are public configuration only:

- `VITE_CONTRACT_ADDRESS`
- `VITE_GENLAYER_NETWORK`
- `VITE_GENLAYER_RPC_URL`

No private key, mnemonic, API token, or wallet credential belongs in the repository or frontend build.

NimbusPact is MIT-licensed; see [`LICENSE`](LICENSE).

## 14. Release / provenance

The frozen deployed contract source is [`contracts/nimbuspact.py`](contracts/nimbuspact.py) with SHA-256 `1a6386e22ffc60d8beae3640569bf25ec6582c7896bb565bb1b161b96810e310`. The tracked proof and release-integrity test bind that source hash to the deployed address and deployment transaction.

The successful Bradbury smoke is live-proven. Contract unit tests, frontend lifecycle tests, typechecking and the production build are tested locally and in CI, but a passing test is not additional live-chain proof. The prior reverted wrapper attempt remains disclosed in the proof record and is not counted as success.

The current production release is the `master` branch published at the repository link above. Exact commit provenance is available in Git history and in the release commit reported with the submission package.
