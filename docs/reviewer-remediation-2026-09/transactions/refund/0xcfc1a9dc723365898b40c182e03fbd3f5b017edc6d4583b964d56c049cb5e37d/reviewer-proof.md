# p-1 creator-refund proof

Refund transaction: `0xcfc1a9dc723365898b40c182e03fbd3f5b017edc6d4583b964d56c049cb5e37d`  
Contract: `0x055F97140CE35FD1e656ebb3D204952A46646681`  
Call: `refund_policy("p-1")`  
Network: Testnet Bradbury, chain ID 4221

## Parent transaction

The same-hash terminal object in `raw-parent-transaction.json` reports `statusName=FINALIZED` (code 7) and `txExecutionResultName=FINISHED_WITH_RETURN` (code 1). Aggregate consensus is `result=1 / AGREE`; all five validator vote values are `1 / AGREE`, with five committed and five revealed votes. No error was reported.

## Final policy state

`post-policy.json` reports `status=REFUNDED`, `refunded=true`, `withdrawn=true`, `resolution_result=NOT_TRIGGERED`, `resolution_code=NONE`, `resolution_attempts=1`, and `data_unavailable_since=0`. The stored creator and beneficiary are both `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5`; payout is `10000000000000000` wei.

## Value-transfer evidence

The finalized parent transaction itself exposes one message record:

- recipient: `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5`;
- value: `10000000000000000` wei;
- data: `0x`;
- `onAcceptance=false`.

This is direct parent message evidence for the intended creator refund. The RPC did not expose a distinct refund child or transfer receipt. `getTriggeredTransactionIds` returned one unrelated child transaction and duplicate parent IDs; those are preserved in `raw-transfer-evidence.json` and were not interpreted as refund receipts.

The contract balance read at the chain head was `0x0` after the refund, down from the known pre-state `0x2386f26fc10000` (`0.01` GEN). The RPC `finalized` tag continued to return `0x2386f26fc10000` at both captures, so that tag is recorded as stale relative to the finalized parent and latest-head read. This is a limitation of the exposed balance view, not an inference from the creator wallet balance.

## Proof decision

The refund path is proven by finalized successful execution, `REFUNDED`/withdrawn policy state, the stored creator recipient, the exact value message record, and a latest-head contract balance of zero. No transaction was broadcast during reconciliation.
