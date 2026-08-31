import { createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus, type GenLayerTransaction, type TransactionHash } from "genlayer-js/types";
import { classifyLifecycleError, classifyReceipt, type LifecycleOutcome } from "./receiptStatus";

export type TriggerType = "HEAVY_RAIN" | "EXTREME_HEAT" | "SEVERE_STORM";
export type NoticeKind = "success" | "warning" | "error";
export type NetworkKey = "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";
export interface RecoveryMessage { kind: NoticeKind; message: string; }
export interface PolicyInput { locationName: string; latitude: string; longitude: string; startDate: string; endDate: string; triggerType: TriggerType; threshold: string; beneficiary: string; payout: string; }
export interface Policy { policy_id: string; creator: string; beneficiary: string; location_name: string; latitude: string; longitude: string; start_date: string; end_date: string; trigger_type: TriggerType; metric: string; threshold: string; payout_amount: string; status: string; evidence_url: string; evidence_digest: string; resolution_result: string; observed_value: string; resolution_code: string; withdrawn: boolean; }
interface PendingTransaction { actionKey: string; hash: string; label: string; createdAt: number; }
interface WalletClient { writeContract(options: Record<string, unknown>): Promise<string>; connect?: (network: string) => Promise<void>; }
type UnknownRecord = Record<string, unknown>;

const contractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS || "").trim();
const networkKey = (import.meta.env.VITE_GENLAYER_NETWORK || "studionet") as NetworkKey;
const rpcUrl = (import.meta.env.VITE_GENLAYER_RPC_URL || "").trim();
const pendingStorageKey = "nimbuspact.pending.v1";
const chainConfig = { localnet, studionet, testnetAsimov, testnetBradbury }[networkKey] || studionet;
const chainMeta: Record<NetworkKey, { label: string; chainId: number; rpc: string }> = {
  localnet: { label: "Localnet", chainId: 61127, rpc: "http://localhost:4000/api" },
  studionet: { label: "Studionet", chainId: 61999, rpc: "https://studio.genlayer.com/api" },
  testnetAsimov: { label: "Testnet Asimov", chainId: 4221, rpc: "https://rpc-asimov.genlayer.com" },
  testnetBradbury: { label: "Testnet Bradbury", chainId: 4221, rpc: "https://rpc-bradbury.genlayer.com" },
};

function readClient() {
  return createClient({ chain: chainConfig, ...(rpcUrl ? { endpoint: rpcUrl } : {}) });
}
function writeClient(address: string): WalletClient {
  const provider = window.ethereum;
  if (!provider) throw new Error("No browser wallet was found. Install a wallet such as MetaMask and try again.");
  return createClient({ chain: chainConfig, account: address as `0x${string}`, provider }) as unknown as WalletClient;
}
function record(value: unknown): UnknownRecord {
  if (value instanceof Map) return Object.fromEntries(value.entries()) as UnknownRecord;
  return value && typeof value === "object" ? value as UnknownRecord : {};
}
function asString(value: unknown, fallback = ""): string { return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value); }
function asBigIntString(value: unknown): string { try { return BigInt(asString(value, "0")).toString(); } catch { return "0"; } }
function normalizePolicy(value: unknown, fallbackId = ""): Policy {
  const raw = record(value);
  return { policy_id: asString(raw.policy_id, fallbackId), creator: asString(raw.creator), beneficiary: asString(raw.beneficiary), location_name: asString(raw.location_name), latitude: asString(raw.latitude), longitude: asString(raw.longitude), start_date: asString(raw.start_date), end_date: asString(raw.end_date), trigger_type: asString(raw.trigger_type) as TriggerType, metric: asString(raw.metric), threshold: asString(raw.threshold), payout_amount: asBigIntString(raw.payout_amount), status: asString(raw.status), evidence_url: asString(raw.evidence_url), evidence_digest: asString(raw.evidence_digest), resolution_result: asString(raw.resolution_result), observed_value: asString(raw.observed_value), resolution_code: asString(raw.resolution_code), withdrawn: Boolean(raw.withdrawn) };
}
function readPending(): PendingTransaction[] { try { const value = JSON.parse(localStorage.getItem(pendingStorageKey) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function writePending(value: PendingTransaction[]): void { localStorage.setItem(pendingStorageKey, JSON.stringify(value)); }
function savePending(entry: PendingTransaction): void { writePending([...readPending().filter((item) => item.actionKey !== entry.actionKey), entry]); }
function removePending(actionKey: string): void { writePending(readPending().filter((item) => item.actionKey !== actionKey)); }
function hashKey(hash: string): TransactionHash { return hash as TransactionHash; }
function formatNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = record(error).code;
  if (code === 4001 || /reject|denied|user canceled|user cancelled/i.test(message)) return "The wallet request was rejected. No transaction was broadcast.";
  if (/chain|network|wallet.*different/i.test(message)) return `Your wallet is on the wrong network. Switch to ${chainMeta[networkKey].label} and try again.`;
  return message;
}
function isTimeout(error: unknown): boolean { return /timeout|timed out|retries|not found|poll/i.test(error instanceof Error ? error.message : String(error)); }
function hasLifecycleSignal(error: unknown): boolean {
  const raw = record(error);
  const message = error instanceof Error ? error.message : String(error);
  return isTimeout(error) || /undetermined|disagree|no majority|consensus|cancel/i.test(message) || raw.statusName !== undefined || raw.status !== undefined || raw.receipt !== undefined || raw.transaction !== undefined;
}
async function waitForFinalized(hash: string): Promise<GenLayerTransaction> { return readClient().waitForTransactionReceipt({ hash: hashKey(hash), status: TransactionStatus.FINALIZED, interval: 3000, retries: 40 }); }
async function ensureNetwork(client: WalletClient): Promise<void> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No browser wallet was found.");
  try {
    if (client.connect) await client.connect(networkKey);
    else await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainMeta[networkKey].chainId.toString(16)}` }] });
  } catch (error) {
    const code = record(error).code;
    if (code === 4902) {
      await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: `0x${chainMeta[networkKey].chainId.toString(16)}`, chainName: `GenLayer ${chainMeta[networkKey].label}`, nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 }, rpcUrls: [rpcUrl || chainMeta[networkKey].rpc] }] });
      return;
    }
    throw new Error(formatNetworkError(error));
  }
}
class LifecycleFailure extends Error {
  constructor(readonly outcome: LifecycleOutcome) {
    super(outcome.message);
  }
}
async function runLifecycle<T>(entry: PendingTransaction, precondition: () => Promise<T | null>, broadcast: () => Promise<string>, reconcile: () => Promise<T>): Promise<T> {
  const pending = readPending().find((item) => item.actionKey === entry.actionKey);
  let hash = pending?.hash || "";
  if (!hash) {
    const existing = await precondition();
    if (existing) return existing;
    try { hash = await broadcast(); savePending({ ...entry, hash }); } catch (error) { throw new Error(formatNetworkError(error)); }
  }
  try {
    const receipt = await waitForFinalized(hash);
    const outcome = classifyReceipt(receipt, hash);
    if (outcome.state !== "SUCCESS") {
      if (!outcome.keepPending) removePending(entry.actionKey);
      throw new LifecycleFailure(outcome);
    }
    const result = await reconcile();
    removePending(entry.actionKey);
    return result;
  } catch (error) {
    if (error instanceof LifecycleFailure) throw error;
    if (hasLifecycleSignal(error)) throw new LifecycleFailure(classifyLifecycleError(error, hash));
    throw new Error(formatNetworkError(error));
  }
}
function createActionKey(address: string, input: PolicyInput): string { return `create:${address.toLowerCase()}:${encodeURIComponent(JSON.stringify(input))}`; }
function samePolicy(policy: Policy, input: PolicyInput, address: string, payoutWei: string): boolean { return policy.creator.toLowerCase() === address.toLowerCase() && policy.location_name === input.locationName.trim() && policy.latitude === Number(input.latitude).toFixed(4) && policy.longitude === Number(input.longitude).toFixed(4) && policy.start_date === input.startDate && policy.end_date === input.endDate && policy.trigger_type === input.triggerType && policy.threshold === Number(input.threshold).toFixed(3) && policy.beneficiary.toLowerCase() === input.beneficiary.toLowerCase() && policy.payout_amount === payoutWei; }
function parseGen(value: string): bigint {
  const cleaned = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(cleaned)) throw new Error("Payout must be a positive GEN amount with up to 18 decimals.");
  const [whole, fraction = ""] = cleaned.split(".");
  const wei = BigInt(whole) * 1000000000000000000n + BigInt(fraction.padEnd(18, "0") || "0");
  if (wei <= 0n) throw new Error("Payout must be greater than zero.");
  return wei;
}

export function getContractAddress(): string { return contractAddress; }
export function getNetworkLabel(): string { return chainMeta[networkKey].label; }
export function getPendingTransactions(): PendingTransaction[] { return readPending(); }
export async function connectWallet(): Promise<string> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No browser wallet was found. Install a wallet such as MetaMask and try again.");
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
    if (!address) throw new Error("The wallet returned no account.");
    await ensureNetwork(writeClient(address));
    return address;
  } catch (error) { throw new Error(formatNetworkError(error)); }
}
export async function getPolicies(): Promise<Policy[]> {
  if (!contractAddress) return [];
  const value = await readClient().readContract({ address: contractAddress as `0x${string}`, functionName: "get_policies", args: [] });
  return Object.entries(record(value)).map(([id, policy]) => normalizePolicy(policy, id)).sort((a, b) => Number(a.policy_id.slice(2)) - Number(b.policy_id.slice(2)));
}
async function getPolicy(policyId: string): Promise<Policy> {
  const value = await readClient().readContract({ address: contractAddress as `0x${string}`, functionName: "get_policy", args: [policyId] });
  return normalizePolicy(value, policyId);
}
export async function recoverPendingTransactions(): Promise<RecoveryMessage[]> {
  const entries = readPending();
  const messages: RecoveryMessage[] = [];
  for (const entry of entries) {
    try {
      const receipt = await waitForFinalized(entry.hash);
      const outcome = classifyReceipt(receipt, entry.hash);
      if (outcome.state === "SUCCESS") {
        removePending(entry.actionKey);
        messages.push({ kind: "success", message: `${entry.label} finalized successfully and was recovered from its saved hash.` });
      } else {
        if (!outcome.keepPending) removePending(entry.actionKey);
        messages.push({ kind: outcome.noticeKind, message: `${entry.label}: ${outcome.message}` });
      }
    } catch (error) {
      if (hasLifecycleSignal(error)) {
        const outcome = classifyLifecycleError(error, entry.hash);
        messages.push({ kind: outcome.noticeKind, message: `${entry.label}: ${outcome.message}` });
      } else {
        messages.push({ kind: "warning", message: `${entry.label} could not be reconciled yet; its hash remains saved.` });
      }
    }
  }
  return messages;
}
export async function createPolicy(input: PolicyInput, walletAddress: string): Promise<Policy> {
  const payoutWei = parseGen(input.payout);
  const entry: PendingTransaction = { actionKey: createActionKey(walletAddress, input), hash: "", label: "Policy funding", createdAt: Date.now() };
  return runLifecycle(entry, async () => { const existing = await getPolicies(); return existing.find((policy) => samePolicy(policy, input, walletAddress, payoutWei.toString())) || null; }, async () => { const client = writeClient(walletAddress); await ensureNetwork(client); return client.writeContract({ address: contractAddress, functionName: "create_policy", args: [input.locationName, input.latitude, input.longitude, input.startDate, input.endDate, input.triggerType, input.threshold, input.beneficiary || walletAddress, payoutWei], value: payoutWei }); }, async () => { const policies = await getPolicies(); const match = policies.find((policy) => samePolicy(policy, input, walletAddress, payoutWei.toString())); if (!match) throw new Error("The funding transaction finalized, but the expected policy state was not found."); return match; });
}
export async function resolvePolicy(policyId: string, walletAddress: string): Promise<Policy> {
  const entry: PendingTransaction = { actionKey: `resolve:${policyId}`, hash: "", label: `${policyId} resolution`, createdAt: Date.now() };
  return runLifecycle(entry, async () => { const policy = await getPolicy(policyId); if (policy.status !== "ACTIVE") throw new Error("This policy has already been resolved. Refresh the policy state before trying again."); return null; }, async () => { const client = writeClient(walletAddress); await ensureNetwork(client); return client.writeContract({ address: contractAddress, functionName: "resolve_policy", args: [policyId], value: 0n }); }, async () => getPolicy(policyId));
}
export async function claimPayout(policyId: string, walletAddress: string): Promise<Policy> {
  const entry: PendingTransaction = { actionKey: `claim:${policyId}`, hash: "", label: `${policyId} payout claim`, createdAt: Date.now() };
  return runLifecycle(entry, async () => { const policy = await getPolicy(policyId); if (policy.status !== "TRIGGERED" || policy.withdrawn) throw new Error("This payout is not currently claimable."); if (policy.beneficiary.toLowerCase() !== walletAddress.toLowerCase()) throw new Error("Connect the beneficiary wallet to claim this payout."); return null; }, async () => { const client = writeClient(walletAddress); await ensureNetwork(client); return client.writeContract({ address: contractAddress, functionName: "claim_payout", args: [policyId], value: 0n }); }, async () => getPolicy(policyId));
}
