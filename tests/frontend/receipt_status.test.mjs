import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLifecycleError,
  classifyReceipt,
  formatNetworkError,
  normalizeNetworkError,
  policyStatusMessage,
} from "../../app/src/lib/receiptStatus.ts";
import { buildWriteOptions, getRuntimeConfig } from "../../app/src/lib/nimbuspact.ts";

const HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

function receipt(overrides = {}) {
  return {
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    ...overrides,
  };
}

test("maps finalized successful execution to SUCCESS", () => {
  const result = classifyReceipt(receipt(), HASH);
  assert.equal(result.state, "SUCCESS");
  assert.equal(result.finalized, true);
  assert.equal(result.executionSucceeded, true);
  assert.equal(result.keepPending, false);
});

test("maps UNDETERMINED and disagreement results without losing the hash", () => {
  const undetermined = classifyReceipt(receipt({ statusName: "UNDETERMINED" }), HASH);
  const disagreement = classifyReceipt(receipt({ resultName: "MAJORITY_DISAGREE" }), HASH);
  for (const result of [undetermined, disagreement]) {
    assert.equal(result.state, "UNDETERMINED");
    assert.equal(result.hash, HASH);
    assert.equal(result.keepPending, true);
    assert.match(result.message, /check again|reconcile/i);
  }
});

test("distinguishes validator timeout, cancellation, and finalized execution failure", () => {
  assert.equal(classifyReceipt(receipt({ statusName: "VALIDATORS_TIMEOUT" }), HASH).state, "TIMEOUT");
  assert.equal(classifyReceipt(receipt({ statusName: "LEADER_TIMEOUT" }), HASH).state, "TIMEOUT");
  assert.equal(classifyReceipt(receipt({ statusName: "CANCELED" }), HASH).state, "CANCELED");
  const failed = classifyReceipt(receipt({ txExecutionResultName: "FINISHED_WITH_ERROR" }), HASH);
  assert.equal(failed.state, "EXECUTION_FAILED");
  assert.equal(failed.finalized, true);
  assert.equal(failed.executionSucceeded, false);
  assert.equal(failed.keepPending, false);
});

test("maps timeout and consensus errors to retryable reconcile states", () => {
  assert.equal(classifyLifecycleError(new Error("request timed out"), HASH).state, "TIMEOUT");
  assert.equal(classifyLifecycleError(new Error("consensus disagreement"), HASH).state, "UNDETERMINED");
  assert.equal(classifyLifecycleError(new Error("RPC unavailable"), HASH).state, "PENDING");
});

test("keeps DATA_UNAVAILABLE separate from transaction consensus outcomes", () => {
  assert.match(policyStatusMessage("DATA_UNAVAILABLE"), /unavailable|malformed|no positive trigger/i);
  assert.match(policyStatusMessage("TRIGGERED"), /finalized|claimable/i);
  assert.match(policyStatusMessage("CLAIMED"), /finalized|claimed/i);
  assert.doesNotMatch(policyStatusMessage("CLAIMED"), /claimable/i);
  assert.match(policyStatusMessage("NOT_TRIGGERED"), /threshold|refund/i);
  assert.match(policyStatusMessage("REFUNDED"), /returned|refund/i);
});

test("normalizes structured wallet and RPC failures without coercing objects", () => {
  const structured = normalizeNetworkError({
    code: -32000,
    error: { data: { message: "Funding must exactly equal the payout amount" } },
    details: { attemptedValue: 100000000000000000n },
  });
  assert.match(structured.headline, /exactly|escrow/i);
  assert.equal(structured.headline.toLowerCase().includes("object object"), false);
  assert.match(structured.diagnostic, /100000000000000000n/);

  const unknown = normalizeNetworkError({ arbitrary: { nested: true } });
  assert.match(unknown.headline, /transaction request failed/i);
  assert.equal(unknown.headline.toLowerCase().includes("object object"), false);
  assert.match(unknown.diagnostic, /arbitrary/);
});

test("keeps exact payable escrow value separate from network transaction handling", () => {
  const options = buildWriteOptions({
    address: "0x1111111111111111111111111111111111111111",
    functionName: "create_policy",
    args: ["Lagos Island"],
    value: 100000000000000000n,
  });
  assert.equal(options.value, 100000000000000000n);
  assert.equal(Object.prototype.hasOwnProperty.call(options, "fees"), false);
});

test("maps the reviewer-facing contract and protocol failure cases", () => {
  const cases = [
    [{ code: 4001 }, /wallet request was rejected/i],
    [{ message: "provider unavailable" }, /compatible browser wallet|available/i],
    [{ code: 4902, message: "unsupported chain" }, /wrong network/i],
    [{ message: "insufficient escrow balance" }, /enough GEN/i],
    [{ message: "insufficient fee funding" }, /needs more GEN.*transaction/i],
    [{ message: "fee policy mismatch" }, /stale|fee policy changed/i],
    [{ message: "fee estimation failed" }, /fee could not be prepared/i],
    [{ code: -32601, message: "method not found" }, /RPC does not support/i],
    [{ message: "Observation window is still open" }, /locked until.*closes/i],
    [{ message: "Refund is not eligible until the recovery grace period expires" }, /not refund-eligible/i],
    [{ message: "This payout is not currently claimable" }, /not claimable/i],
    [{ message: "UNDETERMINED" }, /conclusive result|original transaction hash/i],
    [{ message: "validators timeout" }, /did not finish in time/i],
    [{ message: "execution reverted" }, /contract rejected/i],
  ];
  for (const [error, expected] of cases) assert.match(normalizeNetworkError(error).headline, expected);
});

test("fails closed when a finalized receipt omits the transaction execution result", () => {
  const result = classifyReceipt({
    statusName: "FINALIZED",
    consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
  }, HASH);
  assert.equal(result.state, "EXECUTION_FAILED");
  assert.equal(result.executionSucceeded, false);
});

test("does not treat an application lifecycle label as execution success", () => {
  const result = classifyReceipt({ statusName: "FINALIZED", lifecycle: "finalized-success" }, HASH);
  assert.equal(result.state, "EXECUTION_FAILED");
  assert.equal(result.executionSucceeded, false);
});

test("normalizes Error instances with their actual message and bounded diagnostics", () => {
  const error = new Error("RPC admission rejected");
  const normalized = normalizeNetworkError(error);
  assert.match(normalized.headline, /transaction request failed|admission/i);
  assert.match(normalized.diagnostic, /RPC admission rejected/);
  assert.doesNotMatch(`${normalized.headline} ${normalized.diagnostic}`, /\[object Object\]/i);
});

test("recursively maps nested provider codes and nested receipt outcomes", () => {
  assert.match(normalizeNetworkError({ cause: { error: { code: 4001, message: "User denied" } } }).headline, /rejected/i);
  const lifecycle = classifyLifecycleError({ cause: { receipt: receipt() } }, HASH);
  assert.equal(lifecycle.state, "SUCCESS");
  assert.equal(lifecycle.finalized, true);
});

test("never exposes object coercion even when the provider returns arbitrary objects", () => {
  const unknown = { response: { data: { payload: { nested: { value: 1n } } } } };
  const formatted = formatNetworkError(unknown);
  const normalized = normalizeNetworkError(unknown);
  assert.doesNotMatch(`${formatted} ${normalized.diagnostic}`, /\[object Object\]/i);
  assert.match(normalized.diagnostic, /1n|nested/);
});

test("missing network configuration fails closed instead of defaulting to Studionet", () => {
  const runtime = getRuntimeConfig();
  assert.equal(runtime.configured, false);
  assert.equal(runtime.network, "");
  assert.match(runtime.configurationError, /VITE_CONTRACT_ADDRESS|VITE_GENLAYER_NETWORK/);
});
