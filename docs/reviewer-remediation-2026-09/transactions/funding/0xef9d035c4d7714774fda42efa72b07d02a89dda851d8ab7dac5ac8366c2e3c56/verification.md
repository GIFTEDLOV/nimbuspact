# Finalized funding verified

Transaction: `0xef9d035c4d7714774fda42efa72b07d02a89dda851d8ab7dac5ac8366c2e3c56`.

Target `0x055F97140CE35FD1e656ebb3D204952A46646681`, method `create_policy`, sender/creator/beneficiary `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5`. Consensus is **FINALIZED**, execution **FINISHED_WITH_RETURN**. This is a successful funded creation, not merely a final-status assertion.

`all-data.json` contains the decoded ConsensusData getTransactionAllData result, whose value is `10000000000000000` wei (0.01 GEN). `transaction-raw.json` is the SDK-decoded transaction, not an invented RPC receipt. Exact JSON-RPC request/response bodies used by the SDK are preserved in `../../../rpc/` relative to the evidence root's transactions/funding/hash directory (see the root README for navigation). `normalized.json` independently decodes saved RLP txCalldata with the installed GenLayer codec: the payout argument equals the submitted value, and every immutable term matches `p-1`.

The finalized state read uses `transaction_hash_variant: latest-final`. Policy `p-1` is ACTIVE, payout `10000000000000000`, withdrawn=false, refunded=false, resolution_attempts=0, empty result/code/digest, data_unavailable_since=0. Current contract balance is independently `0x2386f26fc10000` = 0.01 GEN, in `../../contract-balance.json` relative to this directory. Only one policy exists. These establish funded/unsettled equivalents; those are not literal fields named escrow_funded/settled.

Five-of-five is actually supported for this funding transaction: lastRound contains five distinct validators, votesCommitted=5, votesRevealed=5, validatorVotes=[1,1,1,1,1], decoded as five AGREE votes. All five validatorResultHash values match. Full rounds are preserved in all-data.json and the underlying eth_call responses. Do not generalize this committee size or vote result to other transactions.

No historical pre-funding snapshot is available; state-before.json explicitly records that limitation. A chain receipt cannot independently prove which browser signed the historical transaction. The earlier README describes browser origin; this pass independently establishes its on-chain funding, execution, and resulting state only.
