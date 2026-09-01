import { ExecutionResult, TransactionResult, TransactionStatus } from "genlayer-js/types";

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

type UnknownRecord = Record<string, unknown>;

const statusByNumber: Record<number, TransactionStatus> = {
  0: TransactionStatus.UNINITIALIZED,
  1: TransactionStatus.PENDING,
  2: TransactionStatus.PROPOSING,
  3: TransactionStatus.COMMITTING,
  4: TransactionStatus.REVEALING,
  5: TransactionStatus.ACCEPTED,
  6: TransactionStatus.UNDETERMINED,
  7: TransactionStatus.FINALIZED,
  8: TransactionStatus.CANCELED,
  9: TransactionStatus.APPEAL_REVEALING,
  10: TransactionStatus.APPEAL_COMMITTING,
  11: TransactionStatus.READY_TO_FINALIZE,
  12: TransactionStatus.VALIDATORS_TIMEOUT,
  13: TransactionStatus.LEADER_TIMEOUT,
};

const resultByNumber: Record<number, TransactionResult> = {
  0: TransactionResult.IDLE,
  1: TransactionResult.AGREE,
  2: TransactionResult.DISAGREE,
  3: TransactionResult.TIMEOUT,
  4: TransactionResult.DETERMINISTIC_VIOLATION,
  5: TransactionResult.NO_MAJORITY,
  6: TransactionResult.MAJORITY_AGREE,
  7: TransactionResult.MAJORITY_DISAGREE,
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function enumName(value: unknown, numericNames: Record<number, string>): string {
  if (typeof value === "string") return value;
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

function unresolvedOutcome(state: "UNDETERMINED" | "TIMEOUT" | "PENDING", hash: string, message: string): LifecycleOutcome {
  return outcome(state, hash, false, false, true, "warning", message);
}

export function classifyReceipt(receipt: unknown, hash: string): LifecycleOutcome {
  const raw = record(receipt);
  const status = enumName(raw.statusName ?? raw.status, statusByNumber);
  const result = enumName(raw.resultName ?? raw.result, resultByNumber);
  const execution = enumName(raw.txExecutionResultName ?? raw.txExecutionResult, {
    0: ExecutionResult.NOT_VOTED,
    1: ExecutionResult.FINISHED_WITH_RETURN,
    2: ExecutionResult.FINISHED_WITH_ERROR,
  });
  if (status === TransactionStatus.UNDETERMINED || result === TransactionResult.DISAGREE || result === TransactionResult.NO_MAJORITY || result === TransactionResult.MAJORITY_DISAGREE) {
    return unresolvedOutcome(
      "UNDETERMINED",
      hash,
      `Consensus did not reach a decision for ${shortHash(hash)}. The original hash is saved; check again to reconcile it. No replacement transaction was broadcast.`,
    );
  }
  if (status === TransactionStatus.VALIDATORS_TIMEOUT || status === TransactionStatus.LEADER_TIMEOUT || result === TransactionResult.TIMEOUT) {
    return unresolvedOutcome(
      "TIMEOUT",
      hash,
      `Validators did not finish ${shortHash(hash)} in time. The original hash is saved; check again to reconcile it. No replacement transaction was broadcast.`,
    );
  }
  if (status === TransactionStatus.CANCELED) {
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

  const finalized = status === TransactionStatus.FINALIZED;
  if (!finalized) {
    return unresolvedOutcome(
      "PENDING",
      hash,
      `Transaction ${shortHash(hash)} is still processing. The original hash is saved; check again to reconcile it.`,
    );
  }

  const executionSucceeded = execution === ExecutionResult.FINISHED_WITH_RETURN;
  if (executionSucceeded) {
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
  const nested = raw.receipt || raw.transaction || raw;
  const receipt = classifyReceipt(nested, hash);
  if (receipt.state !== "PENDING" || raw.statusName !== undefined || raw.status !== undefined || raw.receipt !== undefined || raw.transaction !== undefined) return receipt;

  const message = error instanceof Error ? error.message : String(error);
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
      `Transaction ${shortHash(hash)} could not be confirmed in time. The original hash is saved; check again to reconcile it. No replacement transaction was broadcast.`,
    );
  }
  return unresolvedOutcome(
    "PENDING",
    hash,
    `Transaction ${shortHash(hash)} could not be reconciled yet. Its original hash remains saved; check again instead of submitting another transaction.`,
  );
}

export function policyStatusMessage(status: string): string {
  if (status === "DATA_UNAVAILABLE") return "The weather source was unavailable or malformed, so NimbusPact failed closed and recorded no positive trigger. In this deployed Bradbury version the result is terminal and the committed GEN has no creator refund path.";
  if (status === "CLAIMED") return "Validators finalized a triggered result and the funded payout has been claimed by the beneficiary.";
  if (status === "TRIGGERED") return "Validators finalized a triggered result. The funded payout is claimable by the beneficiary.";
  if (status === "NOT_TRIGGERED") return "Validators finalized a non-triggered result. No beneficiary payout is due, and this deployed Bradbury version has no creator refund path for the committed GEN.";
  return "Resolve this active policy after its observation window closes to ask validators to inspect its fixed evidence source.";
}
