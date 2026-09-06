# Official documentation reviewed

Reviewed 2026-09-06, before product code changes (none performed). Authority: docs.genlayer.com. These are the exact URLs and relevant headings, not claims that the checked-in SDK implements every newer API.

| Page | Headings used | Remediation implication |
| --- | --- | --- |
| [Networks](https://docs.genlayer.com/developers/networks) | Networks; Testnet Bradbury | Bradbury RPC `https://rpc-bradbury.genlayer.com`, chain 4221, GEN. |
| [Writing to Intelligent Contracts](https://docs.genlayer.com/developers/decentralized-applications/writing-data) | Payable writes; Wait for the intended lifecycle point; Handle failures without duplicating writes | Keep payable value distinct from fees; persist the returned ID; no blind resubmission. |
| [Querying a Transaction](https://docs.genlayer.com/developers/decentralized-applications/querying-a-transaction) | Read stored state; Wait for a decision or finalization; Child transactions and traces; Polling and process restarts | Inspect execution as well as finality, then expected state and outgoing effects. |
| [Transaction statuses](https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/transactions/transaction-statuses) | Transaction statuses; Status is not execution success | Finality does not make a rejected contract call successful. |
| [Fee Outcomes and Debugging](https://docs.genlayer.com/developers/decentralized-applications/fee-outcomes-and-debugging) | Success rule; User-facing outcomes; Refunds | For this review require FINALIZED, FINISHED_WITH_RETURN, and expected state. |
| [Transaction Methods](https://docs.genlayer.com/api-references/genlayer-js/transactions) | waitForTransactionReceipt; waitForFinalization; getTransaction; getTriggeredTransactionIds | Current reference includes both status and waitUntil; inspect installed API. |
| [Value Transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers) | Receiving Value; Sending Value to an EOA or EVM Contract; Reading Balances; Where Balance Lives | Payable decorator and message value, EVM interface external transfer, ghost balance. |
| [Transaction Context](https://docs.genlayer.com/developers/intelligent-contracts/features/transaction-context) | Time and Timestamps; Transaction Timestamp | datetime.now(timezone.utc) is pinned to deterministic transaction time. |
| [Web Access](https://docs.genlayer.com/developers/intelligent-contracts/features/web-access) | HTTP Requests; Handling HTTP Errors; Consensus-Friendly Web Requests | Independent requests inside nondeterministic evaluation; normalize stable evidence. |
| [Non-determinism](https://docs.genlayer.com/developers/intelligent-contracts/features/non-determinism) | What Goes Inside vs Outside; Equivalence Principle; Strict Equality | Web inside nondeterministic block; storage and messages outside. |
| [The Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle) | The Leader/Validator Pattern; Strict Equality | Independently evaluate evidence; shape validation alone is insufficient. |
| [Messages](https://docs.genlayer.com/developers/intelligent-contracts/features/messages) | Internal Messages (IC → IC); External Messages (IC → Chain Layer); Ghost Contracts | External EOA messages occur at finalization. Parent result alone is insufficient transfer proof. |
| [gen_getContractCode](https://docs.genlayer.com/api-references/genlayer-node/gen/gen_getContractCode) | gen_getContractCode | Object request with address and finalized status; decode base64 returned code. |

Both package manifests request `genlayer-js ^1.1.8`. Both lockfiles resolve exactly `1.1.8`; both installed packages report `1.1.8`. Runtime inspection returned `typeof waitForFinalization === "undefined"` and `typeof waitForTransactionReceipt === "function"`. Existing `status: TransactionStatus.FINALIZED` fallback is appropriate for this dependency. No dependency upgrade or migration was attempted.

Installed getTransaction reads ConsensusData `getTransactionData` and `getTransactionAllData` via eth_call. Its JSON-safe calldata conversion loses Map entries, so the funding method and arguments were independently decoded from saved txCalldata using the installed calldata codec. Both decoded structures and exact RPC response bodies are preserved.
