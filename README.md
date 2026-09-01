# NimbusPact

## 1. Product

NimbusPact is a parametric weather-cover application where users create policies, GenLayer validators independently inspect authoritative weather evidence, the Intelligent Contract determines whether the trigger condition was met, and an eligible finalized claim can release the configured payout.

The representative Bradbury smoke is live-proven end to end: create a funded policy, resolve its weather condition, and claim the resulting payout.

## 2. Problem

Neither a claimant, project backend, weather-data submitter, nor one AI provider should be able to unilaterally decide whether a real-world weather trigger occurred. A payout decision needs a visible, reproducible trust boundary and a durable finalized state transition.

## 3. Why GenLayer

NimbusPact puts the consensus-critical trigger determination inside a GenLayer Intelligent Contract. Validators independently execute the same bounded inspection of a fixed weather request, and the contract accepts the decision only through GenLayer consensus. This is useful here because the input is an external, semantic data question while the payout and state machine remain on-chain.

## 4. How it works

1. A policy creator chooses a location, date window, weather trigger, threshold, beneficiary, and payout, then funds the policy with exactly the payout amount.
2. The contract validates and canonicalizes those fields and constructs the fixed Open-Meteo Archive API URL.
3. `resolve_policy` asks validators to inspect the response. The contract checks response shape, coordinates, dates, metric bounds, and deterministic evidence normalization, then uses `gl.eq_principle.strict_eq` to require equivalent decision output.
4. The finalized result is `TRIGGERED`, `NOT_TRIGGERED`, or `DATA_UNAVAILABLE`, with the normalized evidence SHA-256 digest stored on the policy.
5. Only the beneficiary can claim a triggered policy. The claim checks solvency and duplicate-claim guards, emits the finalized external transfer, and records `CLAIMED` / `withdrawn=true`.

## 5. Architecture

- `contracts/nimbuspact.py`: the consensus-critical policy, weather-evidence, resolution, and payout state machine.
- `app/`: Vue/Vite frontend using `genlayer-js`; reads go directly to the deployed contract and writes use the connected browser wallet.
- There is no project backend, database, or custom oracle server.
- Production proof network: Testnet Bradbury.
- Deployed contract: `0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934`
- Weather source: `https://archive-api.open-meteo.com/v1/archive`

## 6. How to use

Install the pinned dependencies and run the existing checks:

```powershell
python -m pip install -r requirements.txt
npm install
npm run contract:lint
npm run test
npm run test:frontend
npm run frontend:typecheck
npm run frontend:build
```

Run the frontend locally:

```powershell
Copy-Item app/.env.example app/.env
npm --prefix app install
npm --prefix app run dev
```

The tracked example targets the verified Bradbury deployment. Connect a wallet on Testnet Bradbury, fund a policy, refresh/reconcile the original transaction hash until it is finalized, then resolve and claim when the finalized state permits it. `ACCEPTED` is provisional; the interface does not present it as success.

## 7. Live proof

The concise tracked evidence record is [`docs/live-proof/bradbury-smoke.json`](docs/live-proof/bradbury-smoke.json). Raw runtime receipts are kept out of source control and are not force-added as a release artifact.

- GitHub repository: https://github.com/GIFTEDLOV/nimbuspact
- Public application: https://nimbuspact.vercel.app
- Release branch: `master`
- Release base commit: `9127a4e5f1cfe6cf3dfb6110d2c19300244ce2b`

| Step | Transaction hash | Final status | Execution | Consensus / finalized state |
| --- | --- | --- | --- | --- |
| Deployment | `0xf02ddbb1fa117ad1dbbabf32dfc41f912fb7d4ac42eda77e9f5130c8186610db` | `FINALIZED / 7` | `FINISHED_WITH_RETURN` | `AGREE`, 5/5 |
| Create | `0x54d931db9b233e64863d33a1aa3150b915b99dfdca44bd3923109c7e6fa5cffd` | `FINALIZED / 7` | `FINISHED_WITH_RETURN` | `AGREE`, 5/5 |
| Resolve | `0xa1487d1c4819cb0aec4f97ddb802f861e4f19c452766527818278ba4210a92be` | `FINALIZED / 7` | `FINISHED_WITH_RETURN` | `AGREE`, 5/5; `p-1 -> TRIGGERED`, observed `1.900` |
| Claim | `0x8fd84714fa7cda44eb8149aff8a6c58eafd720668ca429120d114508989d591e` | `FINALIZED / 7` | `FINISHED_WITH_RETURN` | `AGREE`, 5/5; `p-1 -> CLAIMED`, `withdrawn=true` |

The beneficiary `0x6311dE989ab01Ae4Da77d36CC45d495fbCd4B7a8` received the independently verified gross payout of `100000000000000000` wei. The final contract balance was zero and duplicate claim protection was verified. The deployment/source SHA-256 is `1a6386e22ffc60d8beae3640569bf25ec6582c7896bb565bb1b161b96810e310`.

## 8. Security / trust model

Deterministic logic includes input validation, canonical coordinates and thresholds, date-window limits, response-shape checks, coordinate/date/metric consistency, threshold comparison, beneficiary authorization, exact funding, solvency, and one-time withdrawal state. Semantic judgment is limited to the validator-executed weather inspection and is accepted through strict equivalence consensus.

The evidence digest commits to the normalized provider response and decision evidence. It is an integrity commitment, not cryptographic authentication of Open-Meteo, and validator consensus does not by itself authenticate the weather provider. The production contract uses the public Open-Meteo Archive API; the contract validates what it receives but cannot guarantee provider availability or truth.

The frontend reads the deployed contract directly. Each write performs a precondition read, broadcasts once, saves the returned hash in browser storage, waits for `FINALIZED`, requires successful execution, reads expected state, and reuses the saved hash after refresh or an ambiguous polling interruption.

## 9. Limitations

- This is a Testnet Bradbury release, not a mainnet insurance product.
- Open-Meteo Archive API availability and source correctness remain external dependencies.
- A SHA-256 evidence digest proves consistency with the stored normalized evidence; it does not prove the provider authored or authenticated that evidence.
- External EOA settlement is a finalized GenLayer message without a separate contract-side child receipt/callback. The Bradbury smoke independently verified the settlement carrier and beneficiary balance transition.
- Historical failed attempt `0xbe2fd099ec7f1b52db4a412bd2b587006c237a6ccf6aa516467f430d695c6d6b` was a prior reverted EVM-wrapper claim attempt. It is preserved as disclosed history and is not successful live proof.

## 10. Developer / API details

Public contract methods:

- `create_policy(location_name, latitude, longitude, start_date, end_date, trigger_type, threshold, beneficiary, payout_amount)` payable
- `resolve_policy(policy_id)`
- `claim_payout(policy_id)`
- `get_policy(policy_id)`
- `get_policies()`
- `get_policy_ids()`
- `get_policy_count()`

Environment variables are public configuration only:

- `VITE_CONTRACT_ADDRESS`
- `VITE_GENLAYER_NETWORK`
- `VITE_GENLAYER_RPC_URL`

No private key, mnemonic, API token, or wallet credential belongs in the repository or frontend build. NimbusPact is MIT-licensed; see [`LICENSE`](LICENSE).
