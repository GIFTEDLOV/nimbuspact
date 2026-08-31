import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLifecycleError,
  classifyReceipt,
  policyStatusMessage,
} from "../../app/src/lib/receiptStatus.ts";

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
  assert.match(policyStatusMessage("NOT_TRIGGERED"), /non-triggered|No payout/i);
});
