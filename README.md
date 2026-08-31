# NimbusPact

NimbusPact is a GenLayer parametric weather-coverage application. A policy creator funds coverage for a location, date window, metric, threshold, and beneficiary. GenLayer validators independently inspect the same fixed Open-Meteo Archive API request, reach consensus on a bounded decision, and record the finalized result on the Intelligent Contract.

This local-first MVP is intentionally narrow: it does not accept arbitrary oracle URLs, does not use a backend or database, and does not deploy or submit anything automatically.

## Product flow

1. A connected wallet funds a policy with the exact payout amount.
2. Anyone can request one resolution while the policy is active.
3. Validators validate the HTTP response, JSON shape, coordinates, dates, metric bounds, and deterministic evidence normalization inside `gl.eq_principle.strict_eq`.
4. The contract records `TRIGGERED`, `NOT_TRIGGERED`, or `DATA_UNAVAILABLE` plus an evidence SHA-256 digest.
5. Only a beneficiary can claim a triggered payout, and only once after successful finalized execution.

### Payout transfer boundary

`claim_payout` checks `self.balance >= payout_amount` before emitting the beneficiary's
finalized external GEN transfer. An underfunded claim reverts before either the
transfer message or the `CLAIMED` state is recorded, so funding can be repaired and
the same policy retried. The claim state is written only after the supported
`emit_transfer(..., on="finalized")` call and blocks duplicate attempts.

The current GenLayer contract API does not provide a child-transfer receipt or
callback that an Intelligent Contract can use to reconcile an unexpected external
message failure. The balance guard covers the deterministic insufficient-balance
failure path; a controlled Bradbury smoke test must still verify the finalized
child transfer and beneficiary receipt. NimbusPact does not claim that parent
consensus or its evidence SHA-256 digest authenticates the weather provider itself.

Supported trigger types are `HEAVY_RAIN`, `EXTREME_HEAT`, and `SEVERE_STORM`. The contract constructs every evidence URL from validated policy fields using the fixed provider base `https://archive-api.open-meteo.com/v1/archive`.

## Contract surface

- `create_policy(...)` — payable policy creation and funding.
- `resolve_policy(policy_id)` — one consensus resolution for an active policy.
- `claim_payout(policy_id)` — beneficiary-only pull withdrawal for a triggered policy.
- `get_policy`, `get_policies`, `get_policy_ids`, `get_policy_count` — read methods.

The frontend sends transactions directly to the deployed Intelligent Contract. For every write it performs a precondition read, broadcasts once, persists the hash in local storage, waits for `FINALIZED`, checks successful execution, and reconciles the expected state. Refresh recovery reuses pending hashes instead of broadcasting duplicates.

## Local setup

Install contract tooling from the pinned requirements:

```powershell
python -m pip install -r requirements.txt
```

Run fast contract checks:

```powershell
& "$env:LOCALAPPDATA\Python\pythoncore-3.14-64\Scripts\genvm-lint.exe" check contracts/nimbuspact.py
python -m pytest tests/direct -v
```

Integration scaffolding follows the official `gltest` convention and requires a running GenLayer Studio/localnet:

```powershell
gltest tests/integration/ -v -s
```

Configure the app and run its checks:

```powershell
Copy-Item app/.env.example app/.env
# Set VITE_CONTRACT_ADDRESS in app/.env after deployment.
cd app
npm install
npm run typecheck
npm run build
npm run dev
```

Deployment is deliberately outside this first pass. When authorized later, use the Studio/deployment tooling and set the resulting address in `app/.env`.

## Provenance and license

Project structure and GenLayer tooling conventions were based on the [official GenLayer project boilerplate](https://github.com/genlayerlabs/genlayer-project-boilerplate). Weather-oracle design cues were reviewed in [GIFTEDLOV/genlayer-weather-oracle](https://github.com/GIFTEDLOV/genlayer-weather-oracle), which is MIT-licensed and uses Open-Meteo. Current API behavior was checked against the [GenLayer Equivalence Principle documentation](https://docs.genlayer.com/). NimbusPact contract logic and UI are original to this project; unrelated third-party submission code was not copied.

NimbusPact is released under the MIT license; see [LICENSE](LICENSE).
