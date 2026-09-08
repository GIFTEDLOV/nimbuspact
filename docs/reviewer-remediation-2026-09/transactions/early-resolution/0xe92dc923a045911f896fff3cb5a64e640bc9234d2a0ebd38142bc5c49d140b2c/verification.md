# Early-resolution reconciliation

Transaction hash: `0xe92dc923a045911f896fff3cb5a64e640bc9234d2a0ebd38142bc5c49d140b2c`

The hash targets `resolve_policy("p-1")` on NimbusPact V2 at `0x055F97140CE35FD1e656ebb3D204952A46646681`, sent by the expected creator `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5` on Testnet Bradbury (chain 4221).

The transaction was created at `2026-09-06T22:40:43Z`, while the policy observation end was `2026-09-07T00:00:00Z`. Bradbury returned status code `5` / `ACCEPTED`, consensus result `AGREE`, and execution result code `2` / `FINISHED_WITH_ERROR`. The transaction remained `ACCEPTED` through 120 same-hash polls at three-second intervals and never reached status code `7` / `FINALIZED` during this reconciliation. No finalization call, replacement, or other transaction was submitted.

The read-only `gen_dbg_traceTransaction` result for the same hash contains return data whose printable decoded text includes the exact contract error: **`Observation window is still open`**. This proves the execution rejection reason, but the reviewer’s required proof rule is `FINALIZED + failed execution`; therefore `early_window_enforcement_proven` is `false` until the chain exposes FINALIZED for this hash.

The latest-final read of p-1 remains unchanged:

| field | pre-state | post-state |
|---|---:|---:|
| status | ACTIVE | ACTIVE |
| payout_amount | 10000000000000000 | 10000000000000000 |
| resolution_attempts | 0 | 0 |
| data_unavailable_since | 0 | 0 |
| withdrawn | false | false |
| refunded | false | false |
| evidence_digest | empty | empty |
| resolution_code | empty | empty |

`state_unchanged` is `true`. `eth_getBalance` returns `0x2386f26fc10000` for both `latest` and `finalized`, equal to `0.01 GEN`; together with the unchanged ACTIVE/unwithdrawn/unrefunded state, escrow remains protected. The Policy type does not expose a separate `escrow_funded` field.

Validator evidence is exposed in `transaction-latest.json`: five validator addresses, five `DISAGREE` vote names, five vote hashes, and five identical validator-result hashes. The raw RPC responses are under `rpc/`; polling snapshots are under `poll-*.json`; the exact trace is in `execution-trace-latest.json`.

## Limitation

This is not a finalized reviewer proof yet. The supplied hash was never altered or rebroadcast, and no write method was called during reconciliation. Further progress requires the same hash to transition to FINALIZED on Bradbury; a new transaction must not be created for this purpose.
