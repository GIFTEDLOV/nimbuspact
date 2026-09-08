# p-1 normal-resolution proof

Transaction `0x949d0e19397d5cb6efebba8cbb15eca12e953f57935be88a0424ffeb1f3e8833` called `resolve_policy("p-1")` on NimbusPact V2 at `0x055F97140CE35FD1e656ebb3D204952A46646681` on Testnet Bradbury (chain 4221).

The same-hash terminal read reports `FINALIZED` (status code 7) and `FINISHED_WITH_RETURN` (execution code 1). Aggregate consensus is raw `result=1` / `AGREE`; all five validator vote values are raw `1` / `AGREE`, with five committed and five revealed votes. The complete raw transaction and validator fields are in `terminal-transaction.json`; raw RPC responses are under `rpc/`.

The finalized p-1 read is `NOT_TRIGGERED` with `resolution_result=NOT_TRIGGERED`, `resolution_code=NONE`, `observed_value=10.000`, `resolution_attempts=1`, and `data_unavailable_since=0`. The fixed Open-Meteo archive URL and evidence digest are recorded in `terminal-policy-readback.json`. Creator and beneficiary are both `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5`; payout is `10000000000000000` wei; `withdrawn=false`; `refunded=false`.

Contract balance is `0x2386f26fc10000` at both `latest` and `finalized`, equal to `0.01` GEN. The escrow remains available for the creator refund path.

Recovery classification: `CREATOR_REFUND_NOW`. The next allowed action is `refund_policy("p-1")`, but it was not broadcast during this read-only reconciliation.
