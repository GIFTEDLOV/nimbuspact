export type LifecycleState =
  | "SUCCESS"
  | "UNDETERMINED"
  | "TIMEOUT"
  | "CANCELED"
  | "EXECUTION_FAILED"
  | "PENDING";

export interface LifecycleOutcome {
  state: LifecycleState;
  hash: string;
  finalized: boolean;
  executionSucceeded: boolean;
  keepPending: boolean;
  noticeKind: "success" | "warning" | "error";
  message: string;
}

export interface NormalizedNetworkError {
  headline: string;
  diagnostic: string;
}

export class NetworkFailure extends Error {
  readonly diagnostic: string;

  constructor(message: string, diagnostic: string) {
    super(message);
    this.diagnostic = diagnostic;
    this.name = "NetworkFailure";
  }
}

type UnknownRecord = Record<string, unknown>;

const STATUS_BY_NUMBER: Record<number, string> = {
  0: "UNINITIALIZED",
  1: "PENDING",
  2: "PROPOSING",
  3: "COMMITTING",
  4: "REVEALING",
  5: "ACCEPTED",
  6: "UNDETERMINED",
  7: "FINALIZED",
  8: "CANCELED",
  9: "APPEAL_REVEALING",
  10: "APPEAL_COMMITTING",
  11: "READY_TO_FINALIZE",
  12: "VALIDATORS_TIMEOUT",
  13: "LEADER_TIMEOUT",
};

const RESULT_BY_NUMBER: Record<number, string> = {
  0: "IDLE",
  1: "AGREE",
  2: "DISAGREE",
  3: "TIMEOUT",
  4: "DETERMINISTIC_VIOLATION",
  5: "NO_MAJORITY",
  6: "MAJORITY_AGREE",
  7: "MAJORITY_DISAGREE",
};

const EXECUTION_BY_NUMBER: Record<number, string> = {
  0: "NOT_VOTED",
  1: "FINISHED_WITH_RETURN",
  2: "FINISHED_WITH_ERROR",
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function enumName(value: unknown, numericNames: Record<number, string>): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return numericNames[Number(trimmed)] || "";
    return trimmed.toUpperCase().replace(/\s+/g, "_");
  }
  return typeof value === "number" ? numericNames[value] || "" : "";
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 10)}…` : hash;
}

function outcome(
  state: LifecycleState,
  hash: string,
  finalized: boolean,
  executionSucceeded: boolean,
  keepPending: boolean,
  noticeKind: LifecycleOutcome["noticeKind"],
  message: string,
): LifecycleOutcome {
  return { state, hash, finalized, executionSucceeded, keepPending, noticeKind, message };
}

export function unresolvedOutcome(
  state: "UNDETERMINED" | "TIMEOUT" | "PENDING",
  hash: string,
  message: string,
): LifecycleOutcome {
  return outcome(state, hash, false, false, true, "warning", message);
}

function jsonValue(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  if (depth > 6) return "[MaxDepth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Error) {
    const error = value as Error & { cause?: unknown; code?: unknown; details?: unknown; shortMessage?: unknown };
    return {
      name: error.name,
      message: error.message,
      shortMessage: error.shortMessage,
      details: error.details,
      code: error.code,
      diagnostic: (error as Error & { diagnostic?: unknown }).diagnostic,
      stack: error.stack,
      cause: error.cause === value ? "[Circular]" : jsonValue(error.cause, seen, depth + 1),
    };
  }
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), jsonValue(item, seen, depth + 1)]));
  }
  if (value instanceof Set) return [...value].map((item) => jsonValue(item, seen, depth + 1));
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, seen, depth + 1));

  const raw = value as UnknownRecord;
  const result: UnknownRecord = {};
  for (const key of Object.keys(raw)) {
    try { result[key] = jsonValue(raw[key], seen, depth + 1); } catch { result[key] = "[Unreadable]"; }
  }
  for (const key of ["message", "shortMessage", "details", "reason", "code", "data", "error", "cause", "receipt", "transaction", "status", "statusName", "txExecutionResultName"]) {
    if (!(key in result) && key in raw) {
      try { result[key] = jsonValue(raw[key], seen, depth + 1); } catch { result[key] = "[Unreadable]"; }
    }
  }
  return result;
}

function safeJson(value: unknown, maxLength = 1800): string {
  try {
    const json = JSON.stringify(jsonValue(value, new WeakSet<object>()));
    if (json && json !== "{}") return json.slice(0, maxLength).replace(/\[object Object\]/g, "[unreadable object]");
  } catch {
    // Fall through to the bounded generic diagnostic below.
  }
  return "No structured diagnostic was returned by the wallet or RPC.";
}

const ERROR_FIELDS = [
  "name",
  "errorName",
  "message",
  "shortMessage",
  "details",
  "diagnostic",
  "reason",
  "code",
  "data",
  "error",
  "cause",
  "originalError",
  "rpcError",
  "errors",
  "response",
  "body",
  "result",
  "outcome",
  "receipt",
  "transaction",
  "status",
  "statusName",
  "txExecutionResultName",
  "executionResultName",
  "consensusResult",
  "executionResult",
  "lifecycle",
  "transactionHash",
  "txHash",
  "transaction_hash",
  "txId",
  "transactionId",
];

function collectErrorParts(value: unknown, parts: string[], seen: WeakSet<object>, depth = 0): void {
  if (depth > 4 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value.trim()) parts.push(value.trim());
    return;
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectErrorParts(item, parts, seen, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  const raw = value as UnknownRecord;
  for (const field of ERROR_FIELDS) {
    if (field in raw) collectErrorParts(raw[field], parts, seen, depth + 1);
  }
  if (value instanceof Error && value.stack) parts.push(value.stack);
}

export function errorText(error: unknown): string {
  const parts: string[] = [];
  collectErrorParts(error, parts, new WeakSet<object>());
  return [...new Set(parts)].join(" | ").replace(/\[object Object\]/g, "[unreadable object]");
}

function errorCode(error: unknown): string {
  const values: string[] = [];
  const visit = (value: unknown, seen: WeakSet<object>, depth = 0): void => {
    if (depth > 5 || value === null || value === undefined) return;
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    const raw = value as UnknownRecord;
    if (typeof raw.code === "string" || typeof raw.code === "number" || typeof raw.code === "bigint") values.push(String(raw.code));
    for (const field of ["error", "cause", "data", "originalError", "rpcError", "response", "body"]) visit(raw[field], seen, depth + 1);
  };
  visit(error, new WeakSet<object>());
  return values[0] || "";
}

export function normalizeNetworkError(error: unknown): NormalizedNetworkError {
  const text = errorText(error);
  const lower = text.toLowerCase();
  const code = errorCode(error);
  const diagnostic = safeJson(error);

  if (code === "4001" || /user rejected|user denied|rejected the request|request rejected|denied|user canceled|user cancelled/.test(lower)) {
    return { headline: "The wallet request was rejected. No transaction was broadcast.", diagnostic };
  }
  if (code === "4902" || /wrong network|chain id|chainid|wallet.*network|network.*wallet|switch.*network|unsupported chain|wallet is connected to asimov|provider endpoint/.test(lower)) {
    return { headline: "Your wallet is on the wrong network. Switch to the configured GenLayer network and try again.", diagnostic };
  }
  if (/no browser wallet|metamask is not installed|provider.*unavailable|no compatible wallet|wallet provider.*not found/.test(lower)) {
    return { headline: "No compatible browser wallet is available. Install or unlock a wallet and try again.", diagnostic };
  }
  if (/wallet provider.*does not support|method not found.*wallet_|unsupported wallet method/.test(lower)) {
    return { headline: "This wallet provider cannot switch to the configured GenLayer network. Use a compatible browser wallet and try again.", diagnostic };
  }
  if (code === "-32601" || /method not found|unsupported rpc method|rpc method.*not supported|configured rpc.*does not support/.test(lower)) {
    return { headline: "The configured RPC does not support this GenLayer operation. Check the Bradbury RPC and refresh before retrying.", diagnostic };
  }
  if (/fee estimat|estimate.*fee/.test(lower)) {
    return { headline: "The network fee could not be prepared. Refresh the page and try again; the policy escrow amount is unchanged.", diagnostic };
  }
  if (/fee policy|fee-policy|stale quote|quote.*stale|policy.*mismatch|mismatch.*policy|price cap|cap.*price/.test(lower)) {
    return { headline: "The network fee policy changed or the request is stale. Refresh the page and sign again.", diagnostic };
  }
  if (/insufficient.*fee|fee.*insufficient|feevalue|fee value|protocol fee|fee deposit|not enough.*fee|execution budget/.test(lower)) {
    return { headline: "The wallet needs more GEN to submit this transaction. Keep the policy escrow amount unchanged and try again.", diagnostic };
  }
  if (/insufficient funds|insufficient wallet|insufficient.*escrow|escrow.*insufficient|balance.*low|not enough gen|not enough.*balance/.test(lower)) {
    return { headline: "The wallet does not have enough GEN for the policy escrow and network transaction fee.", diagnostic };
  }
  if (code === "429" || code === "-32005" || /rate limit|too many requests|rpc admission|admission queue|temporarily unavailable/.test(lower)) {
    return { headline: "Bradbury RPC admission is busy or rate-limited. Wait briefly and retry once.", diagnostic };
  }
  if (/transaction canceled|transaction cancelled|cancelled|canceled/.test(lower)) {
    return { headline: "The transaction was canceled before finalization. Its saved hash remains available for reconciliation.", diagnostic };
  }
  if (/observation window is still open|window is still open/.test(lower)) {
    return { headline: "Resolution is locked until the observation window closes. Refresh the policy and try again after the displayed UTC time.", diagnostic };
  }
  if (/funding must exactly equal|value mismatch|exact.*payout|payable.*value/.test(lower)) {
    return { headline: "Policy funding must equal the payout exactly. Network fees are separate and must not be added to escrow.", diagnostic };
  }
  if (/refund.*not eligible|not refund eligible|recovery grace period|only the policy creator/.test(lower)) {
    return { headline: "This policy is not refund-eligible yet. Refresh its state and wait for the displayed recovery time if evidence remains unavailable.", diagnostic };
  }
  if (/not currently claimable|not payout eligible|only the beneficiary|claim.*not eligible|payout.*not/.test(lower)) {
    return { headline: "This payout is not claimable from the connected wallet or current policy state.", diagnostic };
  }
  if (/undetermined|no majority|disagree|consensus/.test(lower)) {
    return { headline: "Consensus did not produce a conclusive result. The original transaction hash is saved; check again instead of rebroadcasting.", diagnostic };
  }
  if (/validator.*timeout|leader.*timeout|timed out|timeout|polling/.test(lower)) {
    return { headline: "The validators did not finish in time. The original transaction hash is saved; check again instead of rebroadcasting.", diagnostic };
  }
  if (/finished_with_error|execution failed|execution reverted|contract.*revert|usererror|user error/.test(lower)) {
    return { headline: "The contract rejected this transaction. Refresh the policy state and review the diagnostic details before retrying.", diagnostic };
  }

  return {
    headline: "The transaction request failed. Review the diagnostic details and try again if the state is unchanged.",
    diagnostic,
  };
}

export function formatNetworkError(error: unknown): string {
  return normalizeNetworkError(error).headline;
}

function findReceipt(value: unknown, seen: WeakSet<object>, depth = 0): UnknownRecord | null {
  if (depth > 5 || value === null || value === undefined || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);
  const raw = value as UnknownRecord;
  if (raw.statusName !== undefined || raw.status !== undefined || raw.txExecutionResultName !== undefined || raw.txExecutionResult !== undefined) return raw;
  for (const field of ["receipt", "transaction", "outcome", "result", "data", "cause", "error"]) {
    const nested = findReceipt(raw[field], seen, depth + 1);
    if (nested) return nested;
  }
  return null;
}

export function classifyReceipt(receipt: unknown, hash: string): LifecycleOutcome {
  const raw = findReceipt(receipt, new WeakSet<object>()) || record(receipt);
  const status = enumName(raw.statusName ?? raw.status, STATUS_BY_NUMBER);
  const result = enumName(raw.resultName ?? raw.result, RESULT_BY_NUMBER);
  const execution = enumName(raw.txExecutionResultName ?? raw.txExecutionResult ?? raw.executionResult, EXECUTION_BY_NUMBER);

  if (status === "UNDETERMINED" || result === "DISAGREE" || result === "NO_MAJORITY" || result === "MAJORITY_DISAGREE") {
    return unresolvedOutcome(
      "UNDETERMINED",
      hash,
      `Consensus did not reach a decision for ${shortHash(hash)}. The original hash is saved; check again to reconcile it. No replacement transaction was broadcast.`,
    );
  }
  if (status === "VALIDATORS_TIMEOUT" || status === "LEADER_TIMEOUT" || result === "TIMEOUT") {
    return unresolvedOutcome(
      "TIMEOUT",
      hash,
      `Validators did not finish ${shortHash(hash)} in time. The original hash is saved; check again to reconcile it. No replacement transaction was broadcast.`,
    );
  }
  if (status === "CANCELED") {
    return outcome(
      "CANCELED",
      hash,
      false,
      false,
      false,
      "error",
      `Transaction ${shortHash(hash)} was canceled. No contract state was accepted; you may retry manually.`,
    );
  }

  if (status !== "FINALIZED") {
    return unresolvedOutcome(
      "PENDING",
      hash,
      `Transaction ${shortHash(hash)} is still processing. The original hash is saved; check again to reconcile it.`,
    );
  }

  if (execution === "FINISHED_WITH_RETURN") {
    return outcome("SUCCESS", hash, true, true, false, "success", `Transaction ${shortHash(hash)} finalized successfully.`);
  }

  return outcome(
    "EXECUTION_FAILED",
    hash,
    true,
    false,
    false,
    "error",
    `Transaction ${shortHash(hash)} finalized, but contract execution failed. No expected contract state was read.`,
  );
}

export function classifyLifecycleError(error: unknown, hash: string): LifecycleOutcome {
  const raw = record(error);
  const nested = findReceipt(error, new WeakSet<object>()) || raw;
  const receipt = classifyReceipt(nested, hash);
  if (
    receipt.state !== "PENDING" ||
    raw.statusName !== undefined ||
    raw.status !== undefined ||
    raw.receipt !== undefined ||
    raw.transaction !== undefined ||
    findReceipt(error, new WeakSet<object>()) !== null
  ) return receipt;

  const message = errorText(error);
  if (/cancel|reject|denied/i.test(message)) {
    return outcome("CANCELED", hash, false, false, false, "error", `Transaction ${shortHash(hash)} was canceled. No contract state was accepted; you may retry manually.`);
  }
  if (/undetermined|disagree|no majority|consensus/i.test(message)) {
    return unresolvedOutcome(
      "UNDETERMINED",
      hash,
      `Consensus did not reach a decision for ${shortHash(hash)}. The original hash is saved; check again to reconcile it. No replacement transaction was broadcast.`,
    );
  }
  if (/timeout|timed out|retries|not found|poll/i.test(message)) {
    return unresolvedOutcome(
      "TIMEOUT",
      hash,
      `Transaction ${shortHash(hash)} could not be confirmed in time. The original hash is saved; check again instead of submitting another transaction.`,
    );
  }
  return unresolvedOutcome(
    "PENDING",
    hash,
    `Transaction ${shortHash(hash)} could not be reconciled yet. Its original hash remains saved; check again instead of submitting another transaction.`,
  );
}

export function policyStatusMessage(status: string): string {
  if (status === "DATA_UNAVAILABLE") return "Weather evidence could not be verified. Your payout remains protected. Retry resolution is available during the recovery period; a delayed creator refund is available if evidence remains unavailable after grace.";
  if (status === "CLAIMED") return "Validators finalized a triggered result and the funded payout has been claimed by the beneficiary.";
  if (status === "REFUNDED") return "The funded escrow was returned to the original policy creator after a safe terminal refund path.";
  if (status === "TRIGGERED") return "Validators finalized a triggered result. The funded payout is claimable by the beneficiary.";
  if (status === "NOT_TRIGGERED") return "Threshold was not reached. Creator refund is available.";
  return "Resolution is available only after the complete UTC observation window closes. The contract enforces this timing on-chain.";
}
