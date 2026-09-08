import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionHashVariant, TransactionStatus, type TransactionHash } from "genlayer-js/types";

const CONTRACT = "0x055F97140CE35FD1e656ebb3D204952A46646681" as const;
const RPC = "https://rpc-bradbury.genlayer.com";
const NETWORK = "testnetBradbury";
const CHAIN_ID = 4221;
const CHAIN_HEX = "0x107d";
const POLICY_ID = "p-1";
const EXPECTED_CREATOR = "0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5";
const STORAGE_KEY = "nimbuspact.reviewer.early-resolution.v2.p-1";
const PROTECTED_FIELDS = ["status", "payout_amount", "resolution_attempts", "data_unavailable_since", "withdrawn", "refunded", "evidence_digest", "resolution_code"] as const;

type UnknownRecord = Record<string, unknown>;
type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
type Policy = Record<string, unknown> & { policy_id: string };
type Evidence = Record<string, unknown>;

const readClient = createClient({ chain: testnetBradbury, endpoint: RPC });
const state: {
  walletAddress: string;
  walletChain: string;
  rpcChain: string;
  policy: Policy | null;
  preState: Policy | null;
  currentTime: number;
  secondsRemaining: number;
  windowExpired: boolean;
  preflightReady: boolean;
  confirmation: boolean;
  locked: boolean;
  busy: boolean;
  broadcastHash: string;
  evidence: Evidence | null;
  message: string;
  stopped: boolean;
} = {
  walletAddress: "",
  walletChain: "",
  rpcChain: "",
  policy: null,
  preState: null,
  currentTime: 0,
  secondsRemaining: 0,
  windowExpired: false,
  preflightReady: false,
  confirmation: false,
  locked: false,
  busy: false,
  broadcastHash: "",
  evidence: null,
  message: "Loading the finalized p-1 state…",
  stopped: false,
};

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const text = (id: string, value: string): void => { $(id).textContent = value; };

function safeJson(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 8) return "[MaxDepth]";
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);
  if (value instanceof Error) {
    const error = value as Error & { code?: unknown; details?: unknown; cause?: unknown };
    return { name: error.name, message: error.message, code: error.code, details: safeJson(error.details, seen, depth + 1), cause: safeJson(error.cause, seen, depth + 1), stack: error.stack };
  }
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), safeJson(item, seen, depth + 1)]));
  if (value instanceof Set) return [...value].map((item) => safeJson(item, seen, depth + 1));
  if (Array.isArray(value)) return value.map((item) => safeJson(item, seen, depth + 1));
  const result: UnknownRecord = {};
  for (const [key, item] of Object.entries(value as UnknownRecord)) result[key] = safeJson(item, seen, depth + 1);
  return result;
}

function json(value: unknown): string { return JSON.stringify(safeJson(value), null, 2); }

function errorText(value: unknown): string {
  const parts: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (item: unknown, depth = 0): void => {
    if (depth > 6 || item === null || item === undefined) return;
    if (typeof item === "string") { if (item.trim()) parts.push(item.trim()); return; }
    if (typeof item === "number" || typeof item === "boolean" || typeof item === "bigint") { parts.push(String(item)); return; }
    if (typeof item !== "object" || seen.has(item as object)) return;
    seen.add(item as object);
    for (const [key, nested] of Object.entries(item as UnknownRecord)) {
      if (["stack", "logs", "events", "messages"].includes(key)) continue;
      visit(nested, depth + 1);
    }
  };
  visit(value);
  return [...new Set(parts)].join(" | ").replace(/\[object Object\]/g, "[unreadable object]").slice(0, 5000);
}

function hexNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const stringValue = String(value ?? "0");
  return stringValue.startsWith("0x") ? Number.parseInt(stringValue, 16) : Number(stringValue);
}

function addressEquals(left: unknown, right: string): boolean { return typeof left === "string" && left.toLowerCase() === right.toLowerCase(); }

function normalizePolicy(value: unknown): Policy {
  const raw = (value && typeof value === "object" ? value : {}) as UnknownRecord;
  const normalized: Policy = { ...raw, policy_id: String(raw.policy_id ?? POLICY_ID) };
  for (const key of ["payout_amount", "observation_start_timestamp", "observation_end_timestamp", "resolution_attempts", "data_unavailable_since"]) {
    const candidate = raw[key];
    normalized[key] = typeof candidate === "bigint" ? candidate.toString() : String(candidate ?? "0");
  }
  normalized.withdrawn = raw.withdrawn === true || raw.withdrawn === "true" || raw.withdrawn === 1;
  normalized.refunded = raw.refunded === true || raw.refunded === "true" || raw.refunded === 1;
  return normalized;
}

async function readPolicy(): Promise<Policy> {
  const result = await readClient.readContract({ address: CONTRACT, functionName: "get_policy", args: [POLICY_ID], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  return normalizePolicy(result);
}

async function readChainTime(): Promise<number> {
  const block = await readClient.request({ method: "eth_getBlockByNumber", params: ["latest", false] }) as UnknownRecord;
  return hexNumber(block.timestamp);
}

async function readRpcChain(): Promise<string> {
  const chain = await readClient.request({ method: "eth_chainId" });
  return String(chain ?? "").toLowerCase();
}

async function readWalletChain(provider: Provider): Promise<string> {
  return String(await provider.request({ method: "eth_chainId" })).toLowerCase();
}

function formatTime(seconds: number): string { return seconds > 0 ? new Date(seconds * 1000).toISOString() : "Unavailable"; }

function findReceipt(value: unknown, seen = new WeakSet<object>(), depth = 0): UnknownRecord {
  if (depth > 7 || value === null || typeof value !== "object" || seen.has(value as object)) return {};
  seen.add(value as object);
  const raw = value as UnknownRecord;
  if (["statusName", "status", "txExecutionResultName", "txExecutionResult", "executionResult"].some((key) => key in raw)) return raw;
  for (const key of ["receipt", "transaction", "outcome", "result", "data", "error", "cause"]) {
    const nested = findReceipt(raw[key], seen, depth + 1);
    if (Object.keys(nested).length) return nested;
  }
  return raw;
}

function enumName(value: unknown, names: Record<number, string>): string {
  if (typeof value === "number") return names[value] || String(value);
  if (typeof value === "bigint") return names[Number(value)] || value.toString();
  const stringValue = String(value ?? "");
  if (/^\d+$/.test(stringValue)) return names[Number(stringValue)] || stringValue;
  return stringValue.toUpperCase().replace(/\s+/g, "_");
}

function transactionDetails(receipt: unknown, hash: string): { finalStatus: string; executionResult: string; executionSucceeded: boolean; executionError: string; validatorEvidence: unknown } {
  const raw = findReceipt(receipt);
  const finalStatus = enumName(raw.statusName ?? raw.status, { 7: "FINALIZED" });
  const executionResult = enumName(raw.txExecutionResultName ?? raw.txExecutionResult ?? raw.executionResult ?? raw.executionResultName, { 1: "FINISHED_WITH_RETURN", 2: "FINISHED_WITH_ERROR" });
  const executionSucceeded = finalStatus === "FINALIZED" && executionResult === "FINISHED_WITH_RETURN";
  const errorParts: string[] = [];
  for (const key of ["error", "executionError", "execution_error", "reason", "message", "details", "returnData", "result", "data", "txExecutionResult"]) {
    if (key in raw) { const value = errorText(raw[key]); if (value) errorParts.push(value); }
  }
  const fullText = errorText(receipt);
  if (fullText && !errorParts.join(" | ").includes(fullText)) errorParts.push(fullText);
  const validatorEvidence = Object.fromEntries(["validators", "validatorData", "consensus", "consensusData", "votes", "eqOutputs", "messages", "nondetDisagreementCallNo"].filter((key) => key in raw).map((key) => [key, safeJson(raw[key])]));
  return { finalStatus, executionResult, executionSucceeded, executionError: [...new Set(errorParts)].join(" | ").slice(0, 8000) || (executionSucceeded ? "" : `No structured execution error was exposed for ${hash}.`), validatorEvidence };
}

function protectedState(policy: Policy | null): UnknownRecord {
  const result: UnknownRecord = {};
  for (const key of PROTECTED_FIELDS) result[key] = policy?.[key] ?? null;
  return result;
}

function sameProtectedState(before: Policy | null, after: Policy | null): boolean {
  return JSON.stringify(protectedState(before)) === JSON.stringify(protectedState(after));
}

function updateButton(): void {
  const checkbox = $("confirm") as HTMLInputElement;
  const attempt = $("attempt") as HTMLButtonElement;
  attempt.disabled = state.locked || state.busy || state.stopped || !state.preflightReady || !checkbox.checked || Boolean(state.broadcastHash);
  ( $("reconcile") as HTMLButtonElement ).hidden = !state.broadcastHash || !state.evidence;
  ( $("download") as HTMLButtonElement ).disabled = !state.evidence;
}

function render(): void {
  text("contract", CONTRACT);
  text("network", `${NETWORK} / chain ${CHAIN_ID} / ${RPC}`);
  text("policy", POLICY_ID);
  text("expected-creator", EXPECTED_CREATOR);
  text("wallet", state.walletAddress || "Not connected");
  text("wallet-chain", state.walletChain || "Not checked");
  text("rpc-chain", state.rpcChain || "Not checked");
  text("status", state.policy ? String(state.policy.status) : "Unread");
  text("observation-end", state.policy ? `${formatTime(Number(state.policy.observation_end_timestamp))} (${state.policy.observation_end_timestamp})` : "Unread");
  text("current-time", state.currentTime ? `${formatTime(state.currentTime)} (${state.currentTime})` : "Unread");
  text("seconds-remaining", state.secondsRemaining > 0 ? String(state.secondsRemaining) : state.windowExpired ? "0 (expired)" : "Unknown");
  const checks = state.preflightReady ? "PASS — wallet, chain, RPC, creator, ACTIVE state, escrow flags, and open window" : state.windowExpired ? "BLOCKED — EARLY_PROOF_WINDOW_EXPIRED" : "BLOCKED — connect wallet and pass all checks";
  text("preflight", checks);
  text("message", state.message);
  text("broadcast-status", state.broadcastHash ? `Saved hash: ${state.broadcastHash}` : state.locked ? "Broadcast attempt locked; no replacement will be submitted." : "No transaction has been broadcast.");
  text("hash-line", state.broadcastHash ? `Broadcast hash (persisted immediately): ${state.broadcastHash}` : "No transaction hash yet.");
  $("message").className = state.preflightReady ? "ok" : state.windowExpired || state.stopped ? "bad" : "muted";
  $("evidence").textContent = state.evidence ? json(state.evidence) : "Evidence will appear after the same hash reaches finality.";
  updateButton();
}

async function refreshPreflight(force = false): Promise<void> {
  if (state.stopped || (state.locked && state.busy && !force)) return;
  try {
    state.rpcChain = await readRpcChain();
    state.policy = await readPolicy();
    state.currentTime = await readChainTime();
    const end = Number(state.policy.observation_end_timestamp);
    state.secondsRemaining = Math.max(0, end - state.currentTime);
    if (state.currentTime >= end) {
      state.windowExpired = true;
      state.preflightReady = false;
      state.message = "EARLY_PROOF_WINDOW_EXPIRED — the broadcast button is permanently disabled.";
      render();
      return;
    }
    const provider = window.ethereum;
    state.walletChain = provider ? await readWalletChain(provider) : "";
    const walletOk = addressEquals(state.walletAddress, EXPECTED_CREATOR);
    const policyOk = state.policy.status === "ACTIVE"
      && addressEquals(state.policy.creator, EXPECTED_CREATOR)
      && state.policy.withdrawn === false
      && state.policy.refunded === false;
    const chainOk = state.rpcChain === CHAIN_HEX && state.walletChain === CHAIN_HEX;
    state.preflightReady = Boolean(provider && walletOk && chainOk && policyOk && state.currentTime < end);
    state.message = state.preflightReady
      ? "All read-only checks passed. Check the confirmation box to enable the one explicit broadcast."
      : "Broadcast disabled until the creator wallet, Bradbury chain, p-1 state, and open observation window all pass.";
  } catch (error) {
    state.preflightReady = false;
    state.message = `Read-only preflight failed: ${errorText(error) || "No structured diagnostic was returned."}`;
  }
  render();
}

async function connectWallet(): Promise<void> {
  if (state.stopped) return;
  const provider = window.ethereum;
  if (!provider) { state.message = "No browser wallet provider is available."; state.preflightReady = false; render(); return; }
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    state.walletAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
    state.walletChain = await readWalletChain(provider);
    if (!addressEquals(state.walletAddress, EXPECTED_CREATOR)) state.message = `Wrong wallet. Connect the expected creator ${EXPECTED_CREATOR}.`;
    else if (state.walletChain !== CHAIN_HEX) state.message = "Wrong wallet network. Switch the wallet to Bradbury chain 4221.";
    else state.message = "Creator wallet and wallet chain verified; refreshing finalized p-1 state.";
    await refreshPreflight(true);
  } catch (error) {
    state.stopped = true;
    state.preflightReady = false;
    state.message = `Wallet approval was rejected or unavailable. No proof transaction exists. ${errorText(error)}`.trim();
    render();
  }
}

function writeClient(address: string) {
  return createClient({ chain: testnetBradbury, endpoint: RPC, account: address as `0x${string}`, provider: window.ethereum as never });
}

function extractHash(value: unknown): string {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  if (!value || typeof value !== "object") return "";
  for (const key of ["hash", "transactionHash", "txHash", "transaction_hash", "txId", "transactionId"]) {
    const candidate = (value as UnknownRecord)[key];
    if (typeof candidate === "string" && /^0x[0-9a-fA-F]{64}$/.test(candidate)) return candidate;
  }
  for (const key of ["error", "cause", "data", "receipt", "transaction", "outcome"]) {
    const found = extractHash((value as UnknownRecord)[key]);
    if (found) return found;
  }
  return "";
}

function persistHash(hash: string): void {
  state.broadcastHash = hash;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ captured_at: new Date().toISOString(), contract: CONTRACT, network: NETWORK, chain_id: CHAIN_ID, policy_id: POLICY_ID, hash, pre_state: safeJson(state.preState) }));
}

async function waitForFinalized(hash: string): Promise<unknown> {
  if (typeof (readClient as unknown as { waitForFinalization?: unknown }).waitForFinalization === "function") return (readClient as unknown as { waitForFinalization(options: { hash: TransactionHash }): Promise<unknown> }).waitForFinalization({ hash: hash as TransactionHash });
  return (readClient as unknown as { waitForTransactionReceipt(options: Record<string, unknown>): Promise<unknown> }).waitForTransactionReceipt({ hash: hash as TransactionHash, status: TransactionStatus.FINALIZED, interval: 3000, retries: 40 });
}

async function reconcileHash(hash: string): Promise<void> {
  state.busy = true;
  state.message = `Reconciling only saved hash ${hash}…`;
  render();
  try {
    const receipt = await waitForFinalized(hash);
    const details = transactionDetails(receipt, hash);
    const postState = await readPolicy();
    const evidence: Evidence = {
      captured_at: new Date().toISOString(),
      contract: CONTRACT,
      network: NETWORK,
      chain_id: CHAIN_ID,
      policy_id: POLICY_ID,
      creator: EXPECTED_CREATOR,
      pre_state: safeJson(state.preState),
      broadcast_hash: hash,
      final_status: details.finalStatus,
      execution_result: details.executionResult,
      execution_succeeded: details.executionSucceeded,
      execution_error: details.executionError,
      validator_evidence: details.validatorEvidence,
      raw_final_receipt: safeJson(receipt),
      post_state: safeJson(postState),
      state_unchanged: sameProtectedState(state.preState, postState),
      protected_fields: PROTECTED_FIELDS,
    };
    state.policy = postState;
    state.evidence = evidence;
    state.message = details.finalStatus === "FINALIZED" && !details.executionSucceeded
      ? "FINALIZED_REJECTION captured. Execution failed/rejected; FINALIZED alone was not treated as success."
      : `Final lifecycle recorded as ${details.finalStatus} / ${details.executionResult}.`;
    state.busy = false;
    render();
  } catch (error) {
    state.busy = false;
    state.message = `The saved hash could not be finalized yet. It remains persisted; reconcile this same hash and do not rebroadcast. ${errorText(error)}`;
    render();
  }
}

async function attemptEarlyResolution(): Promise<void> {
  if (state.locked || state.stopped || state.broadcastHash) return;
  state.locked = true;
  state.busy = true;
  state.message = "Broadcast locked. Rechecking read-only preconditions before the one wallet request…";
  render();
  try {
    await refreshPreflight();
    if (!state.preflightReady || !state.policy) {
      state.busy = false;
      state.message = state.windowExpired ? "EARLY_PROOF_WINDOW_EXPIRED — no transaction was broadcast." : "Preconditions failed; no transaction was broadcast.";
      render();
      return;
    }
    state.preState = normalizePolicy(state.policy);
    const client = writeClient(state.walletAddress);
    const returned = await client.writeContract({ address: CONTRACT, functionName: "resolve_policy", args: [POLICY_ID], value: 0n });
    const hash = extractHash(returned) || (typeof returned === "string" ? returned : "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet did not return a transaction hash.");
    persistHash(hash);
    state.busy = false;
    state.message = `Hash persisted immediately: ${hash}. Waiting for finality without submitting another transaction.`;
    render();
    await reconcileHash(hash);
  } catch (error) {
    const hash = extractHash(error);
    if (hash) {
      persistHash(hash);
      state.busy = false;
      state.message = `A hash was recovered from the wallet error and persisted. Reconcile only ${hash}; no replacement will be submitted.`;
      render();
      return;
    }
    state.busy = false;
    state.message = `No proof transaction exists. The wallet request was rejected or failed before a hash was returned. ${errorText(error)}`.trim();
    render();
  }
}

function downloadEvidence(): void {
  if (!state.evidence) return;
  const blob = new Blob([json(state.evidence)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `nimbuspact-early-resolution-${POLICY_ID}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

$("contract").textContent = CONTRACT;
$("network").textContent = `${NETWORK} / chain ${CHAIN_ID} / ${RPC}`;
$("policy").textContent = POLICY_ID;
$("expected-creator").textContent = EXPECTED_CREATOR;
$("connect").addEventListener("click", () => void connectWallet());
$("attempt").addEventListener("click", () => void attemptEarlyResolution());
$("reconcile").addEventListener("click", () => state.broadcastHash && void reconcileHash(state.broadcastHash));
$("download").addEventListener("click", downloadEvidence);
$("confirm").addEventListener("change", (event) => { state.confirmation = (event.target as HTMLInputElement).checked; updateButton(); });

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  try {
    const parsed = JSON.parse(saved) as UnknownRecord;
    if (typeof parsed.hash === "string") {
      state.broadcastHash = parsed.hash;
      state.locked = true;
      state.message = `A saved reviewer hash exists. Reconcile only ${parsed.hash}; no new broadcast is permitted.`;
    }
  } catch { state.message = "A saved reviewer record could not be parsed; broadcast remains disabled."; state.locked = true; }
}
render();
void refreshPreflight();
window.setInterval(() => void refreshPreflight(), 5000);
