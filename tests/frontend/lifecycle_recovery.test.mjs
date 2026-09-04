import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { defaultObservationDates } from "../../app/src/lib/policyDates.ts";
import {
  extractTransactionHash,
  getPendingTransactions,
  releaseHashlessPending,
  runLifecycle,
} from "../../app/src/lib/nimbuspact.ts";
import { NetworkFailure } from "../../app/src/lib/receiptStatus.ts";

const HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const HASH_2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

function entry(actionKey = "test-action") {
  return { actionKey, hash: "", label: "Test transaction" };
}

function successfulReceipt() {
  return { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" };
}

function rejected(promise, pattern) {
  return assert.rejects(promise, (error) => {
    assert.match(error.message, pattern);
    return true;
  });
}

beforeEach(() => storage.clear());

test("default dates are ordered and future at UTC midnight", () => {
  const dates = defaultObservationDates(new Date("2026-09-04T23:59:59.000Z"));
  assert.equal(dates.startDate, "2026-09-05");
  assert.equal(dates.endDate, "2026-09-06");
  assert.ok(dates.startDate <= dates.endDate);
});

test("definitive wallet/provider failures release the hashless entry", async () => {
  const failures = [
    { code: 4001 },
    { error: { code: 4902, message: "wrong network" } },
    new Error("No browser wallet was found"),
    new Error("insufficient funds"),
    new Error("insufficient fee funding"),
    new Error("fee policy mismatch"),
    new Error("fee estimation failed"),
    { code: -32601, message: "method [gen_getContractCode] doesn't has corresponding handler" },
    { message: "writeContract failed before broadcast", data: { detail: "request was not broadcast" } },
  ];
  for (const failure of failures) {
    const current = entry(`failure-${failures.indexOf(failure)}`);
    await rejected(runLifecycle(current, async () => null, async () => { throw failure; }, async () => ({})), /wallet|network|GEN|fee|transaction|failed/i);
    assert.deepEqual(getPendingTransactions(), []);
  }
});

test("pre-broadcast network binding failure preserves its diagnostic and releases the retry lock", async () => {
  const current = entry("rpc-binding-failure");
  const failure = new NetworkFailure(
    "The configured RPC does not support this GenLayer operation. Check the Bradbury RPC and refresh before retrying.",
    '{"code":-32601,"message":"method [gen_getContractCode] doesn\'t has corresponding handler"}',
  );
  let caught;
  try {
    await runLifecycle(current, async () => null, async () => { throw failure; }, async () => ({}));
  } catch (error) {
    caught = error;
  }
  assert.match(caught.message, /configured RPC does not support/i);
  assert.match(caught.diagnostic, /-32601|gen_getContractCode/);
  assert.deepEqual(getPendingTransactions(), []);
});

test("a wallet rejection can be retried without a stale local lock", async () => {
  const current = entry("retry-after-rejection");
  await rejected(runLifecycle(current, async () => null, async () => { throw { code: 4001 }; }, async () => ({})), /rejected/i);
  const result = await runLifecycle(current, async () => null, async () => HASH, async () => ({ ok: true }), { waitForFinalized: async (hash) => { assert.equal(hash, HASH); return successfulReceipt(); } });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(getPendingTransactions(), []);
});

test("a no-hash return is held as ambiguous until the user explicitly releases it", async () => {
  const current = entry("no-hash-return");
  await rejected(runLifecycle(current, async () => null, async () => "", async () => ({})), /transaction request failed/i);
  assert.equal(getPendingTransactions()[0].phase, "AMBIGUOUS_NO_HASH");
  const released = await releaseHashlessPending(current.actionKey);
  assert.match(released.message, /no transaction ID|lock was released/i);
  assert.deepEqual(getPendingTransactions(), []);
});

test("a malformed object returned from broadcast never becomes object-coercion UX", async () => {
  const current = entry("object-hash-return");
  await rejected(runLifecycle(current, async () => null, async () => ({ hash: HASH }), async () => ({})), /transaction request failed/i);
  assert.equal(getPendingTransactions()[0].hash, "");
  assert.doesNotMatch(getPendingTransactions()[0].phase, /object object/i);
});

test("an SDK error carrying a nested hash is reconciled without rebroadcast", async () => {
  const current = entry("nested-hash");
  let broadcasts = 0;
  const result = await runLifecycle(
    current,
    async () => null,
    async () => { broadcasts += 1; throw { message: "transport interrupted", cause: { transactionHash: HASH_2 } }; },
    async () => ({ ok: true }),
    { waitForFinalized: async (hash) => { assert.equal(hash, HASH_2); return successfulReceipt(); } },
  );
  assert.equal(broadcasts, 1);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(getPendingTransactions(), []);
  assert.equal(extractTransactionHash({ data: { error: { txId: HASH_2 } } }), HASH_2);
});

test("a saved hash is never rebroadcast and a timeout preserves that hash", async () => {
  const current = { ...entry("saved-hash"), hash: HASH, phase: "HASH_RETURNED" };
  storage.set("nimbuspact.pending.v2", JSON.stringify([current]));
  let broadcasts = 0;
  const result = await runLifecycle(current, async () => null, async () => { broadcasts += 1; return HASH_2; }, async () => ({ ok: true }), { waitForFinalized: async (hash) => { assert.equal(hash, HASH); throw new Error("request timed out"); } }).catch((error) => error);
  assert.equal(broadcasts, 0);
  assert.match(result.message, /original hash remains saved|could not be confirmed/i);
  assert.equal(getPendingTransactions()[0].hash, HASH);
});

test("hash-bearing recovery cannot be released by the hashless recovery action", async () => {
  const current = { ...entry("protected-hash"), hash: HASH, phase: "HASH_RETURNED" };
  storage.set("nimbuspact.pending.v2", JSON.stringify([current]));
  await rejected(releaseHashlessPending(current.actionKey), /hash is saved|reconcile/i);
  assert.equal(getPendingTransactions()[0].hash, HASH);
});

test("finalized execution failure is not success and removes the completed hash entry", async () => {
  const current = entry("execution-failure");
  await rejected(
    runLifecycle(current, async () => null, async () => HASH, async () => ({ ok: true }), { waitForFinalized: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR" }) }),
    /contract execution failed/i,
  );
  assert.deepEqual(getPendingTransactions(), []);
});

test("accepted is not treated as finalized settlement", async () => {
  const current = entry("accepted-only");
  await rejected(
    runLifecycle(current, async () => null, async () => HASH, async () => ({ ok: true }), { waitForFinalized: async () => ({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" }) }),
    /still processing/i,
  );
  assert.equal(getPendingTransactions()[0].hash, HASH);
});

test("an existing no-hash entry is checked before a retry and cannot silently rebroadcast", async () => {
  const current = entry("existing-no-hash");
  storage.set("nimbuspact.pending.v2", JSON.stringify([{ ...current, phase: "AMBIGUOUS_NO_HASH" }]));
  let broadcasts = 0;
  await rejected(runLifecycle(current, async () => null, async () => { broadcasts += 1; return HASH; }, async () => ({})), /No transaction ID was returned/i);
  assert.equal(broadcasts, 0);
  assert.equal(getPendingTransactions()[0].hash, "");
});
