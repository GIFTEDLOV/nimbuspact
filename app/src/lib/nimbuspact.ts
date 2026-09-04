import { createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus, type TransactionHash } from "genlayer-js/types";
import {
  classifyLifecycleError,
  classifyReceipt,
  errorText,
  formatNetworkError,
  normalizeNetworkError,
  NetworkFailure,
  unresolvedOutcome,
  type LifecycleOutcome,
} from "./receiptStatus.ts";

export type TriggerType = "HEAVY_RAIN" | "EXTREME_HEAT" | "SEVERE_STORM";
export type NoticeKind = "success" | "warning" | "error";
export type NetworkKey = "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";

export interface RecoveryMessage {
  kind: NoticeKind;
  message: string;
  diagnostic?: string;
}

export interface PolicyInput {
  locationName: string;
  latitude: string;
  longitude: string;
  startDate: string;
  endDate: string;
  triggerType: TriggerType;
  threshold: string;
  beneficiary: string;
  payout: string;
}

export interface Policy {
  policy_id: string;
  creator: string;
  beneficiary: string;
  location_name: string;
  latitude: string;
  longitude: string;
  start_date: string;
  end_date: string;
  trigger_type: TriggerType;
  metric: string;
  threshold: string;
  payout_amount: string;
  observation_start_timestamp: string;
  observation_end_timestamp: string;
  status: string;
  evidence_url: string;
  evidence_digest: string;
  resolution_result: string;
  observed_value: string;
  resolution_code: string;
  resolution_attempts: string;
  data_unavailable_since: string;
  withdrawn: boolean;
  refunded: boolean;
}

export interface ContractWriteRequest {
  address: string;
  functionName: string;
  args: unknown[];
  value: bigint;
}

export interface WalletClient {
  writeContract(options: Record<string, unknown>): Promise<string>;
  readContract(options: Record<string, unknown>): Promise<unknown>;
  waitForTransactionReceipt(options: Record<string, unknown>): Promise<unknown>;
  waitForFinalization?: (options: Record<string, unknown>) => Promise<unknown>;
  getCode?: (options: Record<string, unknown>) => Promise<unknown>;
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  connect?: (network: string) => Promise<void>;
}

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

type PendingPhase = "BROADCASTING" | "HASH_RETURNED" | "AMBIGUOUS_NO_HASH";

export interface PendingTransaction {
  actionKey: string;
  hash: string;
  label: string;
  createdAt: number;
  kind?: "create" | "resolve" | "claim" | "refund";
  phase?: PendingPhase;
  fingerprint?: {
    input: PolicyInput;
    walletAddress: string;
    payoutWei: string;
  };
}

type UnknownRecord = Record<string, unknown>;

export const RECOVERY_GRACE_SECONDS = 86_400;
const viteEnv = import.meta.env || {};
const zeroAddress = "0x0000000000000000000000000000000000000000";
const decimalPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const contractAddress = typeof viteEnv.VITE_CONTRACT_ADDRESS === "string" ? viteEnv.VITE_CONTRACT_ADDRESS.trim() : "";
const historicalRejectedContract = "0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934";
const configuredContractAddress = addressPattern.test(contractAddress)
  && contractAddress.toLowerCase() !== zeroAddress
  && contractAddress.toLowerCase() !== historicalRejectedContract.toLowerCase()
  ? contractAddress
  : "";
const requestedNetwork = typeof viteEnv.VITE_GENLAYER_NETWORK === "string" ? viteEnv.VITE_GENLAYER_NETWORK.trim() : "";
const pendingStorageKey = "nimbuspact.pending.v2";
const chainMeta: Record<NetworkKey, { label: string; chainId: number; rpc: string }> = {
  localnet: { label: "Localnet", chainId: 61127, rpc: "http://localhost:4000/api" },
  studionet: { label: "Studionet", chainId: 61999, rpc: "https://studio.genlayer.com/api" },
  testnetAsimov: { label: "Testnet Asimov", chainId: 4221, rpc: "https://rpc-asimov.genlayer.com" },
  testnetBradbury: { label: "Testnet Bradbury", chainId: 4221, rpc: "https://rpc-bradbury.genlayer.com" },
};
const chainConfigs: Record<NetworkKey, typeof localnet> = { localnet, studionet, testnetAsimov, testnetBradbury };
const networkKey: NetworkKey | null = Object.prototype.hasOwnProperty.call(chainConfigs, requestedNetwork)
  ? requestedNetwork as NetworkKey
  : null;
const chainConfig = networkKey ? chainConfigs[networkKey] : null;
const rpcUrl = typeof viteEnv.VITE_GENLAYER_RPC_URL === "string" ? viteEnv.VITE_GENLAYER_RPC_URL.trim() : "";

function normalizeRpcUrl(value: string): string { return value.trim().replace(/\/$/, "").toLowerCase(); }

function runtimeConfigurationError(): string {
  if (!configuredContractAddress) return "VITE_CONTRACT_ADDRESS is missing, malformed, or points to the rejected historical V1 deployment.";
  if (!networkKey) return "VITE_GENLAYER_NETWORK must be one of localnet, studionet, testnetAsimov, or testnetBradbury.";
  if (rpcUrl && normalizeRpcUrl(rpcUrl) !== normalizeRpcUrl(chainMeta[networkKey].rpc)) return `VITE_GENLAYER_RPC_URL must match the canonical ${chainMeta[networkKey].label} RPC.`;
  return "";
}

export interface RuntimeConfig {
  configured: boolean;
  contractAddress: string;
  network: NetworkKey | "";
  networkLabel: string;
  chainId: number | null;
  rpcUrl: string;
  configurationError: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  const configurationError = runtimeConfigurationError();
  return {
    configured: !configurationError,
    contractAddress: configuredContractAddress,
    network: networkKey || "",
    networkLabel: networkKey ? chainMeta[networkKey].label : "Network configuration missing",
    chainId: networkKey ? chainMeta[networkKey].chainId : null,
    rpcUrl: networkKey ? (rpcUrl || chainMeta[networkKey].rpc) : rpcUrl,
    configurationError,
  };
}

function requireRuntimeConfiguration(): void {
  const error = runtimeConfigurationError();
  if (error) throw new Error(error);
}

function readClient(): WalletClient {
  requireRuntimeConfiguration();
  return createClient({ chain: chainConfig!, ...(rpcUrl ? { endpoint: rpcUrl } : {}) }) as unknown as WalletClient;
}

function writeClient(address: string): WalletClient {
  requireRuntimeConfiguration();
  const provider = window.ethereum as Eip1193Provider | undefined;
  if (!provider) throw new Error("No browser wallet was found. Install a wallet such as MetaMask and try again.");
  if (!addressPattern.test(address) || address.toLowerCase() === zeroAddress) throw new Error("Connect a valid non-zero wallet address before submitting a transaction.");
  return createClient({ chain: chainConfig!, account: address as `0x${string}`, provider }) as unknown as WalletClient;
}

function record(value: unknown): UnknownRecord {
  if (value instanceof Map) return Object.fromEntries(value.entries()) as UnknownRecord;
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    const json = JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? `${nested.toString()}n` : nested);
    return json && json !== "{}" ? json.slice(0, 240) : fallback;
  } catch {
    return fallback;
  }
}

function asBigIntString(value: unknown): string {
  try { return BigInt(asString(value, "0")).toString(); } catch { return "0"; }
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizePolicy(value: unknown, fallbackId = ""): Policy {
  const raw = record(value);
  return {
    policy_id: asString(raw.policy_id, fallbackId),
    creator: asString(raw.creator),
    beneficiary: asString(raw.beneficiary),
    location_name: asString(raw.location_name),
    latitude: asString(raw.latitude),
    longitude: asString(raw.longitude),
    start_date: asString(raw.start_date),
    end_date: asString(raw.end_date),
    trigger_type: asString(raw.trigger_type) as TriggerType,
    metric: asString(raw.metric),
    threshold: asString(raw.threshold),
    payout_amount: asBigIntString(raw.payout_amount),
    observation_start_timestamp: asBigIntString(raw.observation_start_timestamp),
    observation_end_timestamp: asBigIntString(raw.observation_end_timestamp),
    status: asString(raw.status),
    evidence_url: asString(raw.evidence_url),
    evidence_digest: asString(raw.evidence_digest),
    resolution_result: asString(raw.resolution_result),
    observed_value: asString(raw.observed_value),
    resolution_code: asString(raw.resolution_code),
    resolution_attempts: asBigIntString(raw.resolution_attempts),
    data_unavailable_since: asBigIntString(raw.data_unavailable_since),
    withdrawn: asBoolean(raw.withdrawn),
    refunded: asBoolean(raw.refunded),
  };
}

function readPending(): PendingTransaction[] {
  try {
    const value = JSON.parse(localStorage.getItem(pendingStorageKey) || "[]");
    return Array.isArray(value) ? value as PendingTransaction[] : [];
  } catch {
    return [];
  }
}

function writePending(value: PendingTransaction[]): void { localStorage.setItem(pendingStorageKey, JSON.stringify(value)); }
function savePending(entry: PendingTransaction): void { writePending([...readPending().filter((item) => item.actionKey !== entry.actionKey), entry]); }
function removePending(actionKey: string): void { writePending(readPending().filter((item) => item.actionKey !== actionKey)); }

function throwNetworkFailure(error: unknown): never {
  const normalized = normalizeNetworkError(error);
  throw new NetworkFailure(normalized.headline, normalized.diagnostic);
}

function isTimeout(error: unknown): boolean {
  return /timeout|timed out|retries|not found|poll/i.test(errorText(error));
}

function hasLifecycleSignal(error: unknown): boolean {
  const raw = record(error);
  const message = errorText(error);
  return isTimeout(error)
    || /undetermined|disagree|no majority|consensus|cancel/i.test(message)
    || raw.statusName !== undefined
    || raw.status !== undefined
    || raw.receipt !== undefined
    || raw.transaction !== undefined
    || raw.outcome !== undefined;
}

function errorCode(error: unknown): string {
  const values: string[] = [];
  const visit = (value: unknown, seen: WeakSet<object>, depth = 0): void => {
    if (depth > 5 || value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const raw = value as UnknownRecord;
    if (typeof raw.code === "string" || typeof raw.code === "number" || typeof raw.code === "bigint") values.push(String(raw.code));
    for (const field of ["error", "cause", "data", "originalError", "rpcError", "response", "body"]) visit(raw[field], seen, depth + 1);
  };
  visit(error, new WeakSet<object>());
  return values[0] || "";
}

const transactionHashPattern = /^0x[0-9a-fA-F]{64}$/;
const transactionHashFields = ["hash", "transactionHash", "txHash", "transaction_hash", "txId", "transactionId"];

export function extractTransactionHash(error: unknown): string {
  const visit = (value: unknown, seen: WeakSet<object>, depth = 0): string => {
    if (depth > 5 || value === null || value === undefined) return "";
    if (typeof value === "string") return transactionHashPattern.test(value) ? value : "";
    if (typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);
    const raw = value as UnknownRecord;
    for (const field of transactionHashFields) {
      const candidate = raw[field];
      if (typeof candidate === "string" && transactionHashPattern.test(candidate)) return candidate;
    }
    for (const field of ["error", "cause", "data", "originalError", "rpcError", "response", "body", "receipt", "transaction", "outcome"]) {
      const found = visit(raw[field], seen, depth + 1);
      if (found) return found;
    }
    return "";
  };
  return visit(error, new WeakSet<object>());
}

function isDefinitivePreBroadcastFailure(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorText(error).toLowerCase();
  return code === "4001"
    || code === "4902"
    || /user rejected|user denied|rejected the request|request rejected|wrong network|unsupported chain|no browser wallet|provider.*unavailable|metamask.*not installed|insufficient funds|insufficient.*fee|fee policy.*mismatch|fee estimat|estimate.*fee|funding must exactly equal|value mismatch|request was not broadcast|writecontract.*before|execution reverted|contract.*revert|usererror|user error/.test(message);
}

async function waitForFinalized(hash: string): Promise<unknown> {
  const client = readClient();
  if (client.waitForFinalization) return client.waitForFinalization({ hash: hash as TransactionHash });
  return client.waitForTransactionReceipt({ hash: hash as TransactionHash, status: TransactionStatus.FINALIZED, interval: 3000, retries: 40 });
}

async function providerChainId(provider: Eip1193Provider): Promise<string> {
  const chainId = await provider.request({ method: "eth_chainId" });
  return typeof chainId === "string" ? chainId.toLowerCase() : "";
}

async function verifyProviderBinding(provider: Eip1193Provider): Promise<void> {
  requireRuntimeConfiguration();
  const expectedChainId = `0x${chainMeta[networkKey!].chainId.toString(16)}`;
  if (await providerChainId(provider) !== expectedChainId) throw new Error(`Wallet is not connected to ${chainMeta[networkKey!].label}.`);

  const consensusAddress = chainConfig!.consensusMainContract?.address;
  const canonicalClient = readClient();
  if (!consensusAddress || !canonicalClient.getCode || !canonicalClient.request) throw new Error("The configured GenLayer client cannot verify the wallet network endpoint.");
  const [canonicalEvmCode, walletEvmCode, canonicalIcCode, walletIcCode] = await Promise.all([
    canonicalClient.getCode({ address: consensusAddress }),
    provider.request({ method: "eth_getCode", params: [consensusAddress, "latest"] }),
    canonicalClient.request({ method: "gen_getContractCode", params: [{ address: configuredContractAddress }] }),
    provider.request({ method: "gen_getContractCode", params: [{ address: configuredContractAddress }] }),
  ]);
  if (typeof canonicalEvmCode !== "string" || canonicalEvmCode === "0x" || typeof walletEvmCode !== "string" || walletEvmCode === "0x" || canonicalEvmCode.toLowerCase() !== walletEvmCode.toLowerCase() || typeof canonicalIcCode !== "string" || typeof walletIcCode !== "string" || canonicalIcCode !== walletIcCode) {
    throw new Error(`Wallet provider endpoint does not match the canonical ${chainMeta[networkKey!].label} RPC or V2 contract.`);
  }
}

async function ensureNetwork(_client: WalletClient): Promise<void> {
  requireRuntimeConfiguration();
  const provider = window.ethereum as Eip1193Provider | undefined;
  if (!provider) throw new Error("No browser wallet was found.");
  const expectedChainId = `0x${chainMeta[networkKey!].chainId.toString(16)}`;
  try {
    if (await providerChainId(provider) !== expectedChainId) {
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChainId }] });
      } catch (error) {
        if (errorCode(error) !== "4902") throw error;
        await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: expectedChainId, chainName: chainConfig!.name, nativeCurrency: chainConfig!.nativeCurrency, rpcUrls: chainConfig!.rpcUrls.default.http, blockExplorerUrls: [chainConfig!.blockExplorers?.default.url] }] });
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChainId }] });
      }
    }
    await verifyProviderBinding(provider);
  } catch (error) {
    if (error instanceof NetworkFailure) throw error;
    throwNetworkFailure(error);
  }
}

export async function runLifecycle<T>(
  entry: PendingTransaction,
  precondition: () => Promise<T | null>,
  broadcast: () => Promise<string>,
  reconcile: () => Promise<T>,
  hooks: { waitForFinalized?: (hash: string) => Promise<unknown> } = {},
): Promise<T> {
  const pending = readPending().find((item) => item.actionKey === entry.actionKey);
  let hash = pending?.hash || "";
  if (!hash) {
    if (pending) {
      const existing = await precondition();
      if (existing) {
        removePending(entry.actionKey);
        return existing;
      }
      throw new LifecycleFailure(unresolvedOutcome(
        "PENDING",
        "",
        "No transaction ID was returned for a previous submission. Refresh and reconcile the policy before attempting another submission; NimbusPact will not rebroadcast it automatically.",
      ));
    }
    const existing = await precondition();
    if (existing) return existing;
    savePending({ ...entry, hash: "", phase: "BROADCASTING" });
    try {
      const returnedHash = await broadcast();
      if (typeof returnedHash !== "string" || !transactionHashPattern.test(returnedHash)) throw new Error("The wallet did not return a valid transaction hash after submission.");
      hash = returnedHash;
      savePending({ ...entry, hash, phase: "HASH_RETURNED" });
    } catch (error) {
      const errorHash = extractTransactionHash(error);
      if (errorHash) {
        hash = errorHash;
        savePending({ ...entry, hash, phase: "HASH_RETURNED" });
      } else if (isDefinitivePreBroadcastFailure(error)) {
        removePending(entry.actionKey);
      } else {
        savePending({ ...entry, hash: "", phase: "AMBIGUOUS_NO_HASH" });
      }
      if (!hash) throwNetworkFailure(error);
    }
  }
  try {
    const receipt = await (hooks.waitForFinalized || waitForFinalized)(hash);
    const lifecycle = classifyReceipt(receipt, hash);
    if (lifecycle.state !== "SUCCESS" || !lifecycle.finalized || !lifecycle.executionSucceeded) {
      if (!lifecycle.keepPending) removePending(entry.actionKey);
      throw new LifecycleFailure(lifecycle);
    }
    const result = await reconcile();
    removePending(entry.actionKey);
    return result;
  } catch (error) {
    if (error instanceof LifecycleFailure) throw error;
    if (hasLifecycleSignal(error)) throw new LifecycleFailure(classifyLifecycleError(error, hash));
    throwNetworkFailure(error);
  }
}

class LifecycleFailure extends Error {
  readonly outcome: LifecycleOutcome;

  constructor(outcome: LifecycleOutcome) {
    super(outcome.message);
    this.outcome = outcome;
  }
}

function createActionKey(address: string, input: PolicyInput): string {
  return `create:${address.toLowerCase()}:${encodeURIComponent(JSON.stringify(input))}`;
}

function samePolicy(policy: Policy, input: PolicyInput, address: string, payoutWei: string): boolean {
  return policy.creator.toLowerCase() === address.toLowerCase()
    && policy.location_name === input.locationName.trim()
    && policy.latitude === Number(input.latitude).toFixed(4)
    && policy.longitude === Number(input.longitude).toFixed(4)
    && policy.start_date === input.startDate
    && policy.end_date === input.endDate
    && policy.trigger_type === input.triggerType
    && policy.threshold === Number(input.threshold).toFixed(3)
    && policy.beneficiary.toLowerCase() === input.beneficiary.toLowerCase()
    && policy.payout_amount === payoutWei;
}

function parseGen(value: string): bigint {
  const cleaned = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(cleaned)) throw new Error("Payout must be a positive GEN amount with up to 18 decimals.");
  const [whole, fraction = ""] = cleaned.split(".");
  const wei = BigInt(whole) * 1_000_000_000_000_000_000n + BigInt(fraction.padEnd(18, "0") || "0");
  if (wei <= 0n) throw new Error("Payout must be greater than zero.");
  return wei;
}

function parseDecimal(value: string, label: string): number {
  const cleaned = value.trim();
  if (!decimalPattern.test(cleaned)) throw new Error(`${label} must be a plain decimal number.`);
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be a finite decimal number.`);
  return numeric;
}

function parseDateUtc(value: string, label: string): number {
  if (!datePattern.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2000 || year > 2100) throw new Error(`${label} year must be between 2000 and 2100.`);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error(`${label} is not a valid calendar date.`);
  return timestamp;
}

function validateAddress(address: string, label: string): string {
  const cleaned = address.trim();
  if (!addressPattern.test(cleaned)) throw new Error(`${label} must be a valid 20-byte EVM address.`);
  if (cleaned.toLowerCase() === zeroAddress) throw new Error(`${label} cannot be the zero address.`);
  return cleaned;
}

function validatePolicyInput(input: PolicyInput, walletAddress: string): { input: PolicyInput; payoutWei: bigint } {
  const locationName = input.locationName.trim();
  if (locationName.length < 1 || locationName.length > 64 || /[\r\n]/.test(locationName)) throw new Error("Location name must be 1-64 characters without line breaks.");
  const latitudeNumber = parseDecimal(input.latitude, "Latitude");
  const longitudeNumber = parseDecimal(input.longitude, "Longitude");
  if (latitudeNumber < -90 || latitudeNumber > 90) throw new Error("Latitude must be between -90 and 90.");
  if (longitudeNumber < -180 || longitudeNumber > 180) throw new Error("Longitude must be between -180 and 180.");

  const startMs = parseDateUtc(input.startDate, "Observation start");
  const endMs = parseDateUtc(input.endDate, "Observation end");
  if (Math.floor(Date.now() / 1000) >= Math.floor(startMs / 1000)) throw new Error("Observation start must be a future UTC date; retroactive policies are rejected on-chain.");
  if (endMs < startMs) throw new Error("Observation end must not precede observation start.");
  const inclusiveDays = Math.floor((endMs - startMs) / 86_400_000) + 1;
  if (inclusiveDays > 31) throw new Error("Observation window cannot exceed 31 days.");

  const thresholdNumber = parseDecimal(input.threshold, "Threshold");
  const thresholdBounds: Record<TriggerType, [number, number]> = { HEAVY_RAIN: [0, 1000], EXTREME_HEAT: [-100, 100], SEVERE_STORM: [0, 500] };
  if (!Object.prototype.hasOwnProperty.call(thresholdBounds, input.triggerType)) throw new Error("Unsupported trigger type.");
  const [minimum, maximum] = thresholdBounds[input.triggerType];
  if (thresholdNumber < minimum || thresholdNumber > maximum) throw new Error(`Threshold for ${input.triggerType} must be between ${minimum} and ${maximum}.`);

  const creator = validateAddress(walletAddress, "Connected wallet");
  const beneficiary = validateAddress(input.beneficiary || creator, "Beneficiary");
  const payoutWei = parseGen(input.payout);
  return {
    input: {
      ...input,
      locationName,
      latitude: latitudeNumber.toFixed(4),
      longitude: longitudeNumber.toFixed(4),
      threshold: thresholdNumber.toFixed(3),
      beneficiary,
      payout: input.payout.trim(),
    },
    payoutWei,
  };
}

export function buildWriteOptions(request: ContractWriteRequest): Record<string, unknown> {
  return {
    address: request.address,
    functionName: request.functionName,
    args: request.args,
    value: request.value,
  };
}

export function getContractAddress(): string { return configuredContractAddress; }
export function getNetworkLabel(): string { return networkKey ? chainMeta[networkKey].label : "Network configuration missing"; }
export function getPendingTransactions(): PendingTransaction[] { return readPending(); }
export function observationCloseTimestamp(policy: Policy): number { return Number(policy.observation_end_timestamp); }
export function refundAvailableTimestamp(policy: Policy): number | null {
  if (policy.status === "NOT_TRIGGERED") return Math.floor(Date.now() / 1000);
  if (policy.status === "DATA_UNAVAILABLE" && Number(policy.data_unavailable_since) > 0) return Number(policy.data_unavailable_since) + RECOVERY_GRACE_SECONDS;
  return null;
}
export function canRetryResolution(policy: Policy, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (policy.status !== "ACTIVE" && policy.status !== "DATA_UNAVAILABLE") return false;
  if (nowSeconds < observationCloseTimestamp(policy)) return false;
  return policy.status === "ACTIVE" || nowSeconds < Number(policy.data_unavailable_since) + RECOVERY_GRACE_SECONDS;
}
export function canRefundPolicy(policy: Policy, walletAddress: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (policy.creator.toLowerCase() !== walletAddress.toLowerCase() || policy.withdrawn || policy.refunded) return false;
  if (policy.status === "NOT_TRIGGERED") return true;
  return policy.status === "DATA_UNAVAILABLE" && nowSeconds >= Number(policy.data_unavailable_since) + RECOVERY_GRACE_SECONDS;
}
export function formatUtcTimestamp(timestamp: number): string { return new Date(timestamp * 1000).toISOString().replace(".000Z", "Z"); }

export async function releaseHashlessPending(actionKey: string): Promise<RecoveryMessage> {
  const entry = readPending().find((item) => item.actionKey === actionKey);
  if (!entry) return { kind: "success", message: "The local transaction recovery entry was already cleared." };
  if (entry.hash) throw new Error("A transaction hash is saved for this action. Reconcile that hash instead of releasing it.");

  try {
    const fingerprint = entry.fingerprint;
    if (entry.kind === "create" && fingerprint) {
      const existing = (await getPolicies()).find((policy) => samePolicy(
        policy,
        fingerprint.input,
        fingerprint.walletAddress,
        fingerprint.payoutWei,
      ));
      if (existing) {
        removePending(actionKey);
        return { kind: "success", message: `${entry.label} was found on-chain. The no-hash recovery entry was cleared without rebroadcasting.` };
      }
    } else if (entry.kind && entry.kind !== "create") {
      const policyId = entry.actionKey.split(":")[1] || "";
      const policy = await getPolicy(policyId);
      const completed = entry.kind === "resolve"
        ? !["ACTIVE", "DATA_UNAVAILABLE"].includes(policy.status)
        : entry.kind === "claim"
          ? policy.status === "CLAIMED" || policy.withdrawn
          : policy.status === "REFUNDED" || policy.refunded;
      if (completed) {
        removePending(actionKey);
        return { kind: "success", message: `${entry.label} already changed policy state on-chain. The no-hash recovery entry was cleared.` };
      }
    }
  } catch (error) {
    throwNetworkFailure(error);
  }

  removePending(actionKey);
  return { kind: "warning", message: `${entry.label} returned no transaction ID and no matching policy state was found. The local retry lock was released; retry only after confirming the wallet did not approve a request.` };
}

export async function connectWallet(): Promise<string> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No browser wallet was found. Install a wallet such as MetaMask and try again.");
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
    if (!address) throw new Error("The wallet returned no account.");
    validateAddress(address, "Connected wallet");
    await ensureNetwork(writeClient(address));
    return address;
  } catch (error) {
    if (error instanceof NetworkFailure) throw error;
    throwNetworkFailure(error);
  }
}

export async function getPolicies(): Promise<Policy[]> {
  if (!configuredContractAddress) return [];
  const value = await readClient().readContract({ address: configuredContractAddress as `0x${string}`, functionName: "get_policies", args: [] });
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index + 1), item] as const) : Object.entries(record(value));
  return entries.map(([id, policy]) => normalizePolicy(policy, id)).sort((a, b) => Number(a.policy_id.slice(2)) - Number(b.policy_id.slice(2)));
}

async function getPolicy(policyId: string): Promise<Policy> {
  const value = await readClient().readContract({ address: configuredContractAddress as `0x${string}`, functionName: "get_policy", args: [policyId] });
  return normalizePolicy(value, policyId);
}

export async function recoverPendingTransactions(): Promise<RecoveryMessage[]> {
  const entries = readPending();
  const messages: RecoveryMessage[] = [];
  for (const entry of entries) {
    if (!entry.hash) {
      if (entry.kind === "create" && entry.fingerprint) {
        try {
          const policies = await getPolicies();
          const existing = policies.find((policy) => samePolicy(
            policy,
            entry.fingerprint?.input as PolicyInput,
            entry.fingerprint?.walletAddress || "",
            entry.fingerprint?.payoutWei || "0",
          ));
          if (existing) {
            removePending(entry.actionKey);
            messages.push({ kind: "success", message: `${entry.label} was found on-chain while reconciling the submission without a returned hash.` });
            continue;
          }
        } catch {
          // Keep the no-hash lock when the state read itself is unavailable.
        }
      }
      messages.push({ kind: "warning", message: `${entry.label} did not return a transaction hash. Refresh policy state before attempting another submission; no replacement transaction was broadcast.` });
      continue;
    }
    try {
      const receipt = await waitForFinalized(entry.hash);
      const lifecycle = classifyReceipt(receipt, entry.hash);
      if (lifecycle.state === "SUCCESS") {
        removePending(entry.actionKey);
        messages.push({ kind: "success", message: `${entry.label} finalized successfully and was recovered from its saved hash.` });
      } else {
        if (!lifecycle.keepPending) removePending(entry.actionKey);
        messages.push({ kind: lifecycle.noticeKind, message: `${entry.label}: ${lifecycle.message}` });
      }
    } catch (error) {
      if (hasLifecycleSignal(error)) {
        const lifecycle = classifyLifecycleError(error, entry.hash);
        messages.push({ kind: lifecycle.noticeKind, message: `${entry.label}: ${lifecycle.message}` });
      } else {
        const normalized = normalizeNetworkError(error);
        messages.push({ kind: "warning", message: `${entry.label} could not be reconciled yet; its hash remains saved.`, diagnostic: normalized.diagnostic });
      }
    }
  }
  return messages;
}

export async function createPolicy(input: PolicyInput, walletAddress: string): Promise<Policy> {
  const validated = validatePolicyInput(input, walletAddress);
  const normalized = validated.input;
  const payoutWei = validated.payoutWei;
  const request: ContractWriteRequest = {
    address: configuredContractAddress,
    functionName: "create_policy",
    args: [normalized.locationName, normalized.latitude, normalized.longitude, normalized.startDate, normalized.endDate, normalized.triggerType, normalized.threshold, normalized.beneficiary, payoutWei],
    value: payoutWei,
  };
  const entry: PendingTransaction = {
    actionKey: createActionKey(walletAddress, normalized),
    hash: "",
    label: "Policy funding",
    createdAt: Date.now(),
    kind: "create",
    fingerprint: { input: normalized, walletAddress, payoutWei: payoutWei.toString() },
  };
  return runLifecycle(
    entry,
    async () => { const existing = await getPolicies(); return existing.find((policy) => samePolicy(policy, normalized, walletAddress, payoutWei.toString())) || null; },
    async () => { const client = writeClient(walletAddress); await ensureNetwork(client); return client.writeContract(buildWriteOptions(request)); },
    async () => { const policies = await getPolicies(); const match = policies.find((policy) => samePolicy(policy, normalized, walletAddress, payoutWei.toString())); if (!match) throw new Error("The funding transaction finalized, but the expected policy state was not found."); return match; },
  );
}

export async function resolvePolicy(policyId: string, walletAddress: string): Promise<Policy> {
  validateAddress(walletAddress, "Connected wallet");
  const entry: PendingTransaction = { actionKey: `resolve:${policyId}`, hash: "", label: `${policyId} resolution`, createdAt: Date.now() };
  return runLifecycle(
    entry,
    async () => {
      const policy = await getPolicy(policyId);
      if (!canRetryResolution(policy)) {
        if (policy.status === "ACTIVE" && Math.floor(Date.now() / 1000) < observationCloseTimestamp(policy)) throw new Error("Observation window is still open");
        if (policy.status === "DATA_UNAVAILABLE" && Math.floor(Date.now() / 1000) >= Number(policy.data_unavailable_since) + RECOVERY_GRACE_SECONDS) throw new Error("DATA_UNAVAILABLE recovery grace period has expired");
        throw new Error("This policy is not resolvable in its current state.");
      }
      return null;
    },
    async () => {
      const client = writeClient(walletAddress);
      await ensureNetwork(client);
      return client.writeContract(buildWriteOptions({ address: configuredContractAddress, functionName: "resolve_policy", args: [policyId], value: 0n }));
    },
    async () => getPolicy(policyId),
  );
}

export async function claimPayout(policyId: string, walletAddress: string): Promise<Policy> {
  validateAddress(walletAddress, "Connected wallet");
  const entry: PendingTransaction = { actionKey: `claim:${policyId}`, hash: "", label: `${policyId} payout claim`, createdAt: Date.now() };
  return runLifecycle(
    entry,
    async () => { const policy = await getPolicy(policyId); if (policy.status !== "TRIGGERED" || policy.withdrawn || policy.refunded) throw new Error("This payout is not currently claimable."); if (policy.beneficiary.toLowerCase() !== walletAddress.toLowerCase()) throw new Error("Connect the beneficiary wallet to claim this payout."); return null; },
    async () => { const client = writeClient(walletAddress); await ensureNetwork(client); return client.writeContract(buildWriteOptions({ address: configuredContractAddress, functionName: "claim_payout", args: [policyId], value: 0n })); },
    async () => getPolicy(policyId),
  );
}

export async function refundPolicy(policyId: string, walletAddress: string): Promise<Policy> {
  validateAddress(walletAddress, "Connected wallet");
  const entry: PendingTransaction = { actionKey: `refund:${policyId}`, hash: "", label: `${policyId} creator refund`, createdAt: Date.now() };
  return runLifecycle(
    entry,
    async () => { const policy = await getPolicy(policyId); if (!canRefundPolicy(policy, walletAddress)) throw new Error("Refund is not eligible for this policy or connected wallet."); return null; },
    async () => { const client = writeClient(walletAddress); await ensureNetwork(client); return client.writeContract(buildWriteOptions({ address: configuredContractAddress, functionName: "refund_policy", args: [policyId], value: 0n })); },
    async () => getPolicy(policyId),
  );
}

export { formatNetworkError };
