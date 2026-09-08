# Finalized early-resolution rejection proof

Transaction: `0xe92dc923a045911f896fff3cb5a64e640bc9234d2a0ebd38142bc5c49d140b2c`  
Contract: `0x055F97140CE35FD1e656ebb3D204952A46646681`  
Call: `resolve_policy("p-1")`  
Network: Testnet Bradbury, chain ID 4221  
Sender: `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5`

## Transaction finality

The terminal transaction read in `terminal-transaction.json` reports raw `status: 7` and SDK `statusName: FINALIZED`. The RPC/SDK object does not expose a dedicated finalized-at timestamp or finalization block. It does expose the read-state block range: activation `20921081`, processing `20921081`, proposal `20921083`. The terminal object was captured at `2026-09-07T08:04:06.108Z`.

## Execution result

This was not a successful write. The same terminal object reports raw `txExecutionResult: 2` and `txExecutionResultName: FINISHED_WITH_ERROR`. The terminal debug trace in `execution-trace-terminal.json` contains return data whose decoded text includes **`Observation window is still open`**. That is the contract rejection reason.

## State consequence

The final `get_policy("p-1")` read is in `terminal-policy-readback.json`. Compared with the pre-state preserved in `normalized.json`, every protected field is unchanged:

| field | pre-state | post-state |
| --- | --- | --- |
| status | `ACTIVE` | `ACTIVE` |
| payout_amount | `10000000000000000` | `10000000000000000` |
| resolution_attempts | `0` | `0` |
| data_unavailable_since | `0` | `0` |
| withdrawn | `false` | `false` |
| refunded | `false` | `false` |
| evidence_digest | empty | empty |
| resolution_code | empty | empty |

`state_unchanged` is `true`. `terminal-escrow-balance.json` records `eth_getBalance` of `0x2386f26fc10000` at both `latest` and `finalized`, equal to `10000000000000000` wei / `0.01` GEN. Together with ACTIVE, `withdrawn=false`, and `refunded=false`, this proves escrow remains protected. The contract policy read does not expose a separate `escrow_funded` field.

## Consensus and validator evidence

The raw transaction fields are preserved in `terminal-transaction.json` and the raw Bradbury responses in `rpc-terminal/`:

- top-level `result: 1`, decoded by the checked-in GenLayerJS mapping as `resultName: AGREE`;
- `lastRound.result: 1`;
- `lastRound.votesCommitted: 5` and `votesRevealed: 5`;
- `lastRound.validatorVotes: [2, 2, 2, 2, 2]`, decoded as `validatorVotesName: [DISAGREE, DISAGREE, DISAGREE, DISAGREE, DISAGREE]`;
- five `roundValidators`, five `validatorVotesHash` values, and five identical `validatorResultHash` values;
- separate `txExecutionResult: 2`, decoded as `FINISHED_WITH_ERROR`.

The installed SDK source confirms the fields are different enum domains: `result`/`resultName` is a transaction `ResultType`, `lastRound.validatorVotes`/`validatorVotesName` is a `VoteType[]`, and `txExecutionResult`/`txExecutionResultName` is an execution-result enum. Therefore the aggregate consensus result is AGREE on a transaction whose execution failed, while the five per-validator labels are DISAGREE vote-type values. The raw schema does not include prose stating what object each DISAGREE is directed at, so this artifact makes no 5/5 validator-agreement claim and does not treat validator labels as execution success.

## Proof decision

The required rule is satisfied for early-window enforcement:

`FINALIZED` + `FINISHED_WITH_ERROR` + exact contract error `Observation window is still open` + unchanged policy state + protected escrow.

No replacement transaction, second broadcast, or other write was made during reconciliation. This transaction is ready to be referenced before any separate recovery-phase work.
