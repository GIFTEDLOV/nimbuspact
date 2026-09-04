<template>
  <div class="app-shell">
    <div class="release-strip">
      <span>NIMBUSPACT V2 · BRADBURY RELEASE</span>
      <span class="release-strip-copy">Exact escrow funding, finalized settlement, and safe recovery</span>
      <span class="release-strip-copy" data-runtime-binding>IC {{ runtimeConfig.contractAddress || "unconfigured" }} · {{ runtimeConfig.networkLabel }}</span>
      <a href="https://github.com/GIFTEDLOV/nimbuspact/blob/master/docs/live-proof/bradbury-smoke.json" target="_blank" rel="noreferrer">
        View historical proof <ArrowUpRight :size="13" />
      </a>
    </div>

    <header class="topbar section-width">
      <a class="brand" href="#top" aria-label="NimbusPact home">
        <span class="brand-mark"><CloudRain :size="19" stroke-width="2.2" /></span>
        <span>NimbusPact</span>
      </a>

      <nav class="nav-links" aria-label="Main navigation">
        <a href="#coverage">Coverage</a>
        <a href="#how-it-works">How it works</a>
        <a href="#technical">Trust model</a>
      </nav>

      <button class="wallet-button" :class="{ connected: walletAddress }" @click="handleWallet">
        <WalletCards :size="16" />
        {{ walletAddress ? shortAddress(walletAddress) : "Connect wallet" }}
      </button>
    </header>

    <main id="top">
      <section class="hero section-width">
        <div class="hero-grid-lines" aria-hidden="true"></div>
        <div class="hero-accent-shape" aria-hidden="true"></div>

        <div class="hero-copy">
          <span class="eyebrow">Parametric weather cover, executed by consensus</span>
          <h1>Weather cover<br /><em>built for execution.</em></h1>
          <p class="hero-lede">
            Fund a clear weather condition, let GenLayer validators independently inspect the same fixed public evidence,
            and release the payout only when the finalized Intelligent Contract state says the trigger occurred.
          </p>
          <div class="hero-actions">
            <a class="primary-button" href="#create">Create a policy <ArrowDownRight :size="16" /></a>
            <a class="secondary-link" href="#how-it-works">See the settlement path <ArrowUpRight :size="14" /></a>
          </div>
        </div>

        <aside class="proof-card" aria-label="Historical Bradbury V1 proof snapshot">
          <div class="proof-card-head">
            <span>Historical V1 proof / p-1</span>
            <span class="proof-status proof-status-rejected"><CircleCheck :size="13" /> Rejected release</span>
          </div>
          <div class="proof-location">Lagos, Nigeria</div>
          <div class="proof-title">Heavy rain trigger</div>
          <div class="proof-metric">
            <strong>1.900</strong>
            <div><span>mm</span><small>observed peak</small></div>
          </div>
          <div class="proof-rule"><span>Threshold</span><b>≥ 0.000 mm</b></div>
          <div class="proof-divider"></div>
          <dl class="proof-list">
            <div><dt>Resolution</dt><dd>TRIGGERED</dd></div>
            <div><dt>Settlement</dt><dd>CLAIMED</dd></div>
            <div><dt>Payout</dt><dd>0.10 GEN</dd></div>
            <div><dt>Contract</dt><dd>0xEAA6…C934</dd></div>
          </dl>
        </aside>
      </section>

      <section class="trust-band section-width" aria-label="NimbusPact trust model summary">
        <div><span>01</span><strong>No project oracle backend</strong><p>The IC constructs and reads the fixed Open-Meteo Archive request itself.</p></div>
        <div><span>02</span><strong>Consensus before payout</strong><p>A positive trigger must reach finalized contract state before the beneficiary can claim.</p></div>
        <div><span>03</span><strong>Evidence commitment</strong><p>The normalized evidence is SHA-256 committed on the resolved policy for auditability.</p></div>
      </section>

      <section class="editorial-intro section-width">
        <div class="editorial-label">THE PRODUCT</div>
        <div class="editorial-copy">
          <h2>Parametric cover with a decision trail you can audit.</h2>
          <p>
            NimbusPact removes the application backend from the payout decision. Policy terms are bounded on-chain,
            validators independently fetch the same source, the Intelligent Contract computes the threshold result,
            and the frontend reconciles the original transaction hash through finality instead of blindly rebroadcasting.
          </p>
        </div>
      </section>

      <section class="stats section-width" aria-label="NimbusPact V2 preflight overview">
        <div class="stat-card"><span>Policies on-chain</span><strong>{{ policies.length.toString().padStart(2, "0") }}</strong><small>V2 read after compatible deployment</small></div>
        <div class="stat-card"><span>Locked policy value</span><strong>{{ lockedCollateral }}</strong><small>GEN attached to unclaimed policies</small></div>
        <div class="stat-card"><span>Evidence source</span><strong class="text-stat">Open-Meteo</strong><small>Archive API · fixed request · UTC</small></div>
        <div class="stat-card"><span>Execution rule</span><strong class="text-stat">Finalized only</strong><small>State read after successful execution</small></div>
      </section>

      <section id="coverage" class="workspace section-width">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Coverage desk</span>
            <h2>Create, resolve, and settle.</h2>
          </div>
          <button class="quiet-button" :disabled="loading" @click="refresh">
            <RefreshCw :class="{ spinning: loading }" :size="14" />
            {{ recovery.length ? "Check pending hash" : "Refresh state" }}
          </button>
        </div>

        <div v-if="notice" class="notice" :class="`notice-${notice.kind}`" role="status">
          <component :is="notice.kind === 'success' ? CircleCheck : AlertTriangle" :size="17" />
          <span>{{ notice.message }}</span>
          <details v-if="notice.diagnostic" class="notice-diagnostic">
            <summary>Technical details</summary>
            <code>{{ notice.diagnostic }}</code>
          </details>
          <button class="notice-close" aria-label="Dismiss message" @click="notice = null">×</button>
        </div>

        <div class="workspace-grid">
          <section id="create" class="panel create-panel">
            <div class="panel-heading">
              <div><span class="section-kicker">New policy</span><h3>Commit the payout</h3></div>
              <span class="step-count">01 / 03</span>
            </div>
            <p class="panel-intro">
              Choose one bounded weather condition. The contract canonicalizes these fields and constructs the fixed evidence URL.
            </p>

            <form @submit.prevent="submitCreate">
              <label class="field full-field"><span>Location label</span><input v-model.trim="form.locationName" required maxlength="64" placeholder="e.g. Lagos Island" /></label>
              <div class="field-row">
                <label class="field"><span>Latitude</span><input v-model.trim="form.latitude" inputmode="decimal" required placeholder="6.5244" /></label>
                <label class="field"><span>Longitude</span><input v-model.trim="form.longitude" inputmode="decimal" required placeholder="3.3792" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Observation start</span><input v-model="form.startDate" type="date" required /></label>
                <label class="field"><span>Observation end</span><input v-model="form.endDate" type="date" required /></label>
              </div>
              <div class="field-row">
                <label class="field">
                  <span>Trigger type</span>
                  <select v-model="form.triggerType" @change="syncThreshold">
                    <option value="HEAVY_RAIN">Heavy rain</option>
                    <option value="EXTREME_HEAT">Extreme heat</option>
                    <option value="SEVERE_STORM">Severe storm</option>
                  </select>
                </label>
                <label class="field"><span>Threshold <small>{{ thresholdUnit }}</small></span><input v-model.trim="form.threshold" inputmode="decimal" required /></label>
              </div>
              <label class="field full-field"><span>Beneficiary address</span><input v-model.trim="form.beneficiary" required placeholder="0x…" /></label>
              <label class="field full-field"><span>Payout amount <small>GEN</small></span><div class="amount-input"><input v-model.trim="form.payout" inputmode="decimal" required placeholder="0.25" /><span>GEN</span></div></label>

              <div class="funding-note">
                <LockKeyhole :size="15" />
                <span>
                  The contract escrows exactly the stated payout. The wallet handles the network transaction fee separately; it is never added to policy escrow. V2 provides creator refunds for NOT_TRIGGERED and safely expired DATA_UNAVAILABLE policies.
                </span>
              </div>

              <div class="fee-summary" aria-live="polite">
                <div><span>Policy escrow</span><strong>{{ form.payout || "0" }} GEN</strong></div>
                <div><span>Wallet network fee</span><strong>Separate</strong></div>
              </div>
              <p class="form-hint">This Bradbury release sends the exact escrow as the payable value. The wallet/provider handles any network transaction charge separately; no unsupported v0.6 fee deposit is added to escrow.</p>

              <button class="submit-button" type="submit" :disabled="busy || !configured || !walletAddress">
                <LoaderCircle v-if="busy" class="spinning" :size="16" />
                <span v-else>Fund policy</span>
                <ArrowUpRight v-if="!busy" :size="15" />
              </button>
              <p v-if="!configured" class="form-hint warning-copy">{{ runtimeConfig.configurationError }}</p>
              <p v-else-if="!walletAddress" class="form-hint">Connect a wallet on {{ networkLabel }} to fund a policy.</p>
            </form>
          </section>

          <section class="policy-column">
            <div v-if="recovery.length" class="recovery-banner">
              <Clock3 :size="17" />
              <div>
                <strong>Submission recovery is active</strong>
                <span v-if="recovery[0]?.hash">{{ recovery.length }} transaction{{ recovery.length === 1 ? "" : "s" }} remain linked to the saved hash{{ recovery.length === 1 ? " " + shortHash(recovery[0]?.hash || "") : "es" }}. NimbusPact will reconcile, not rebroadcast.</span>
                <span v-else>No transaction ID was returned. NimbusPact checked policy state and will not rebroadcast an unknown request automatically. Release the local lock only after confirming the wallet did not approve a request.</span>
              </div>
              <button v-if="recovery[0]?.hash" class="inline-button" :disabled="loading" @click="refresh"><RefreshCw :size="13" /> Check again</button>
              <button v-else class="inline-button" :disabled="loading" @click="releaseRecovery(recovery[0])">Release no-hash lock</button>
            </div>

            <div v-if="!policies.length && !loading" class="empty-state">
              <CloudSun :size="28" />
              <h3>No policies yet</h3>
              <p>Fund the first policy and its complete state trail will appear here.</p>
            </div>

            <article v-for="policy in policies" :key="policy.policy_id" class="policy-card" :class="{ selected: selectedPolicy?.policy_id === policy.policy_id }" @click="selectPolicy(policy)">
              <div class="policy-card-header">
                <span class="policy-id">{{ policy.policy_id }}</span>
                <span class="status-tag" :class="statusClass(policy.status)">{{ statusLabel(policy.status) }}</span>
              </div>
              <div class="policy-main">
                <div><h3>{{ policy.location_name }}</h3><p>{{ triggerLabel(policy.trigger_type) }} · {{ policy.start_date }} → {{ policy.end_date }}</p></div>
                <strong>{{ formatGen(policy.payout_amount) }} <small>GEN</small></strong>
              </div>
              <div class="policy-rule"><span>{{ policy.metric }}</span><span>≥ {{ policy.threshold }} {{ metricUnit(policy.metric) }}</span></div>
              <div class="policy-card-footer">
                <span>Beneficiary {{ shortAddress(policy.beneficiary) }}</span>
                <button v-if="policy.status === 'ACTIVE'" class="inline-button" :disabled="busy || !resolutionWindowClosed(policy)" :title="resolutionWindowClosed(policy) ? 'Resolve policy' : 'Wait until the observation window has closed'" @click.stop="resolve(policy)">
                  <Radar :size="13" /> {{ resolutionWindowClosed(policy) ? "Resolve" : "Window open" }}
                </button>
                <button v-else-if="policy.status === 'DATA_UNAVAILABLE' && canRetry(policy)" class="inline-button" :disabled="busy" @click.stop="resolve(policy)"><RefreshCw :size="13" /> Retry resolution</button>
                <button v-else-if="policy.status === 'TRIGGERED' && !policy.withdrawn" class="inline-button claim" :disabled="busy" @click.stop="claim(policy)"><HandCoins :size="13" /> Claim payout</button>
                <button v-if="canRefund(policy)" class="inline-button refund" :disabled="busy" @click.stop="refund(policy)"><HandCoins :size="13" /> Claim refund</button>
                <span v-if="policy.status === 'DATA_UNAVAILABLE' && !canRetry(policy) && !canRefund(policy)">Recovery window open</span>
                <span v-else-if="policy.status === 'DATA_UNAVAILABLE' && canRefund(policy)">Refund available now</span>
                <span v-else-if="policy.status === 'CLAIMED'">Payout claimed</span>
                <span v-else-if="policy.status === 'REFUNDED'">Creator refunded</span>
                <span v-else-if="policy.status === 'NOT_TRIGGERED' && !canRefund(policy)">Refund unavailable</span>
              </div>
              <p v-if="policy.status === 'ACTIVE'" class="policy-timing">Resolution becomes available after {{ formatUtcTimestamp(observationCloseTimestamp(policy)) }}.</p>
              <p v-if="policy.status === 'DATA_UNAVAILABLE' && refundAvailableTimestamp(policy)" class="policy-timing">Refund available after {{ formatUtcTimestamp(refundAvailableTimestamp(policy) || 0) }}.</p>
            </article>
          </section>
        </div>
      </section>

      <section v-if="selectedPolicy" class="detail-section section-width" aria-live="polite">
        <div class="detail-heading">
          <div><span class="section-kicker">Policy detail</span><h2>{{ selectedPolicy.location_name }} <span class="muted-id">{{ selectedPolicy.policy_id }}</span></h2></div>
          <span class="status-tag" :class="statusClass(selectedPolicy.status)">{{ statusLabel(selectedPolicy.status) }}</span>
        </div>
        <div class="detail-grid">
          <div class="detail-box">
            <span class="detail-label">Resolution</span>
            <strong>{{ resultTitle(selectedPolicy) }}</strong>
            <p>{{ resultDescription(selectedPolicy) }}</p>
            <div v-if="selectedPolicy.observed_value" class="observed-value">Observed peak <b>{{ selectedPolicy.observed_value }} {{ metricUnit(selectedPolicy.metric) }}</b></div>
          </div>
          <div class="detail-box">
            <span class="detail-label">Evidence commitment</span>
            <strong>{{ selectedPolicy.evidence_digest ? "Digest recorded" : "Awaiting resolution" }}</strong>
            <p>Validators inspect the fixed Open-Meteo URL constructed from the policy’s canonical location and dates.</p>
            <code v-if="selectedPolicy.evidence_digest">sha256:{{ selectedPolicy.evidence_digest }}</code>
            <a :href="selectedPolicy.evidence_url" target="_blank" rel="noreferrer">View fixed evidence URL <ArrowUpRight :size="13" /></a>
          </div>
          <div class="detail-box">
            <span class="detail-label">Payout state</span>
            <strong>{{ selectedPolicy.withdrawn ? (selectedPolicy.status === "REFUNDED" ? "Refunded" : "Transferred") : selectedPolicy.status === "TRIGGERED" ? "Claimable" : selectedPolicy.status === "NOT_TRIGGERED" ? "Refund available" : "Locked" }}</strong>
            <p>{{ selectedPolicy.status === "NOT_TRIGGERED" ? "Threshold was not reached. Creator refund is available." : selectedPolicy.status === "DATA_UNAVAILABLE" ? "Evidence is retriable during recovery; a delayed creator refund protects the escrow if it remains unavailable." : "Only the beneficiary can claim a triggered payout, and only after successful finalized execution." }}</p>
            <span class="beneficiary-chip"><UserRound :size="13" /> {{ shortAddress(selectedPolicy.beneficiary) }}</span>
          </div>
        </div>
      </section>

      <section id="how-it-works" class="how-section section-width">
        <div class="how-heading">
          <span class="section-kicker">The settlement path</span>
          <h2>Three actions.<br /><em>One preserved trail.</em></h2>
        </div>
        <div class="steps">
          <div class="step"><span class="step-index">01</span><ShieldCheck :size="20" /><h3>Fund</h3><p>The creator sends exactly the stated payout amount into the payable Intelligent Contract.</p></div>
          <div class="step"><span class="step-index">02</span><Radar :size="20" /><h3>Resolve</h3><p>After the observation window closes, validators independently fetch the same fixed Open-Meteo request and reach strict-equivalence consensus.</p></div>
          <div class="step"><span class="step-index">03</span><CircleCheck :size="20" /><h3>Settle</h3><p>A triggered result is claimable by the beneficiary; a non-trigger or safely expired unavailable result is pull-refundable by the creator.</p></div>
        </div>
      </section>

      <section id="technical" class="technical-section section-width">
        <div class="technical-heading">
          <span class="section-kicker">Trust boundary</span>
          <h2>The contract decides.<br /><em>The source is still external.</em></h2>
        </div>
        <div class="technical-copy">
          <p>
            NimbusPact keeps the consensus-critical threshold decision inside the Intelligent Contract. Inputs are bounded,
            weather values are normalized deterministically, and a SHA-256 digest is stored with the result. The digest proves
            integrity against the normalized evidence used by the validators; it does not cryptographically authenticate Open-Meteo or guarantee that provider’s truth.
          </p>
          <div class="technical-pills">
            <span><Code2 :size="14" /> strict_eq consensus</span>
            <span><Database :size="14" /> no project backend</span>
            <span><Fingerprint :size="14" /> SHA-256 commitment</span>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="section-width footer-inner">
        <div><span class="brand footer-brand"><span class="brand-mark"><CloudRain :size="17" /></span><span>NimbusPact</span></span><p>Parametric weather cover with finalized GenLayer settlement.</p></div>
        <div class="footer-links"><a href="#coverage">Coverage</a><a href="#technical">Trust model</a><a href="https://github.com/GIFTEDLOV/nimbuspact" target="_blank" rel="noreferrer">GitHub <ArrowUpRight :size="12" /></a></div>
        <div class="footer-meta"><span>Target: Testnet Bradbury V2</span><span>Historical V1: 0xEAA6…C934</span><span>© 2026 NimbusPact</span></div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleCheck, CloudRain, CloudSun, Clock3, Code2, Database, Fingerprint, HandCoins, LoaderCircle, LockKeyhole, Radar, RefreshCw, ShieldCheck, UserRound, WalletCards } from "lucide-vue-next";
import { canRefundPolicy, canRetryResolution, claimPayout, connectWallet, createPolicy, formatUtcTimestamp, getNetworkLabel, getPendingTransactions, getPolicies, getRuntimeConfig, observationCloseTimestamp, recoverPendingTransactions, refundAvailableTimestamp, refundPolicy, releaseHashlessPending, resolvePolicy, type NoticeKind, type Policy, type PolicyInput, type RecoveryMessage } from "./lib/nimbuspact";
import { NetworkFailure, normalizeNetworkError, policyStatusMessage } from "./lib/receiptStatus";
import { defaultObservationDates } from "./lib/policyDates";

const runtimeConfig = getRuntimeConfig();
const configured = runtimeConfig.configured;
const networkLabel = getNetworkLabel();
const walletAddress = ref<string | null>(null);
const policies = ref<Policy[]>([]);
const selectedPolicy = ref<Policy | null>(null);
const loading = ref(false);
const busy = ref(false);
const recovery = ref(getPendingTransactions());
const notice = ref<{ kind: NoticeKind; message: string; diagnostic?: string } | null>(null);

const defaultDates = defaultObservationDates();
const form = ref<PolicyInput>({ locationName: "Lagos Island", latitude: "6.5244", longitude: "3.3792", startDate: defaultDates.startDate, endDate: defaultDates.endDate, triggerType: "HEAVY_RAIN", threshold: "50", beneficiary: "", payout: "0.25" });

const thresholdUnit = computed(() => form.value.triggerType === "HEAVY_RAIN" ? "mm" : form.value.triggerType === "EXTREME_HEAT" ? "°C" : "km/h");
const lockedCollateral = computed(() => {
  const total = policies.value.reduce((sum, policy) => policy.withdrawn ? sum : sum + BigInt(policy.payout_amount || "0"), 0n);
  return `${formatGen(total.toString())} GEN`;
});

function shortAddress(address: string): string { return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not set"; }
function shortHash(hash: string): string { return hash ? `${hash.slice(0, 10)}…` : "not available"; }
function formatGen(value: string): string { const amount = BigInt(value || "0"); const whole = amount / 1000000000000000000n; const fraction = (amount % 1000000000000000000n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, ""); return fraction ? `${whole}.${fraction}` : whole.toString(); }
function triggerLabel(trigger: string): string { return trigger === "HEAVY_RAIN" ? "Heavy rain" : trigger === "EXTREME_HEAT" ? "Extreme heat" : "Severe storm"; }
function metricUnit(metric: string): string { return metric === "PRECIPITATION_MM" ? "mm" : metric === "TEMPERATURE_MAX_C" ? "°C" : "km/h"; }
function statusLabel(status: string): string { return status === "ACTIVE" ? "Active" : status === "TRIGGERED" ? "Triggered" : status === "NOT_TRIGGERED" ? "Not triggered" : status === "DATA_UNAVAILABLE" ? "Data unavailable" : status === "REFUNDED" ? "Refunded" : "Claimed"; }
function statusClass(status: string): string { return `status-${status.toLowerCase()}`; }
function resultTitle(policy: Policy): string { return policy.status === "TRIGGERED" || policy.status === "CLAIMED" ? "Weather trigger confirmed" : policy.status === "NOT_TRIGGERED" ? "Threshold not crossed" : policy.status === "DATA_UNAVAILABLE" ? "Evidence unavailable" : policy.status === "REFUNDED" ? "Escrow refunded" : "Awaiting resolution"; }
function resultDescription(policy: Policy): string { return policyStatusMessage(policy.status); }
function showNotice(kind: NoticeKind, message: string, diagnostic?: string): void { notice.value = { kind, message, diagnostic }; }
function showError(error: unknown, fallback: string): void { const normalized = error instanceof NetworkFailure ? { headline: error.message, diagnostic: error.diagnostic } : normalizeNetworkError(error); showNotice("error", normalized.headline || fallback, normalized.diagnostic); console.error("NimbusPact transaction diagnostic", error); }
function resolutionWindowClosed(policy: Policy): boolean {
  return Math.floor(Date.now() / 1000) >= observationCloseTimestamp(policy);
}
function canRetry(policy: Policy): boolean { return canRetryResolution(policy); }
function canRefund(policy: Policy): boolean { return Boolean(walletAddress.value) && canRefundPolicy(policy, walletAddress.value || ""); }
async function releaseRecovery(entry: { actionKey: string } | undefined): Promise<void> {
  if (!entry) return;
  try {
    const result: RecoveryMessage = await releaseHashlessPending(entry.actionKey);
    showNotice(result.kind, result.message, result.diagnostic);
    recovery.value = getPendingTransactions();
  } catch (error) { showError(error, "The no-hash recovery entry could not be released."); }
}

async function handleWallet(): Promise<void> {
  if (walletAddress.value) return;
  try { walletAddress.value = await connectWallet(); if (!form.value.beneficiary) form.value.beneficiary = walletAddress.value; showNotice("success", `Wallet connected on ${networkLabel}.`); }
  catch (error) { showError(error, "Wallet connection was not completed."); }
}
async function refresh(): Promise<void> {
  if (!configured) return;
  loading.value = true;
  try { const recovered = await recoverPendingTransactions(); recovery.value = getPendingTransactions(); if (recovered.length) showNotice(recovered[0].kind, recovered[0].message); policies.value = await getPolicies(); if (selectedPolicy.value) selectedPolicy.value = policies.value.find((policy) => policy.policy_id === selectedPolicy.value?.policy_id) ?? null; }
  catch (error) { showError(error, "Could not read NimbusPact state."); }
  finally { loading.value = false; }
}
function syncThreshold(): void { form.value.threshold = form.value.triggerType === "HEAVY_RAIN" ? "50" : form.value.triggerType === "EXTREME_HEAT" ? "35" : "80"; }
function selectPolicy(policy: Policy): void { selectedPolicy.value = policy; }
async function submitCreate(): Promise<void> {
  if (!walletAddress.value) { showNotice("error", "Connect the beneficiary or creator wallet before funding a policy."); return; }
  busy.value = true;
  try {
    const input = { ...form.value, beneficiary: form.value.beneficiary || walletAddress.value };
    const policy = await createPolicy(input, walletAddress.value);
    policies.value = await getPolicies();
    selectedPolicy.value = policy;
    showNotice("success", `${policy.policy_id} was finalized and funded. Escrow was exactly ${form.value.payout} GEN; the network fee was separate.`);
  }
  catch (error) { showError(error, "The policy transaction did not complete."); }
  finally { busy.value = false; recovery.value = getPendingTransactions(); }
}
async function resolve(policy: Policy): Promise<void> {
  if (!canRetry(policy)) {
    const availableAt = policy.status === "DATA_UNAVAILABLE" && refundAvailableTimestamp(policy) ? ` Retry is closed after the recovery deadline ${formatUtcTimestamp(refundAvailableTimestamp(policy) || 0)}.` : ` Resolution becomes available after ${formatUtcTimestamp(observationCloseTimestamp(policy))}.`;
    showNotice("warning", availableAt);
    return;
  }
  busy.value = true;
  try { const result = await resolvePolicy(policy.policy_id, walletAddress.value || ""); policies.value = await getPolicies(); selectedPolicy.value = result; showNotice(result.status === "TRIGGERED" ? "success" : result.status === "DATA_UNAVAILABLE" ? "warning" : "success", result.status === "TRIGGERED" ? "Validators finalized a triggered result. The payout is now claimable by the beneficiary." : result.status === "DATA_UNAVAILABLE" ? "Weather evidence could not be verified. Your payout remains protected. Retry resolution is available." : "Validators finalized a non-triggered result. Creator refund is available."); }
  catch (error) { showError(error, "Resolution did not finalize successfully."); }
  finally { busy.value = false; recovery.value = getPendingTransactions(); }
}
async function claim(policy: Policy): Promise<void> {
  busy.value = true;
  try { const result = await claimPayout(policy.policy_id, walletAddress.value || ""); policies.value = await getPolicies(); selectedPolicy.value = result; showNotice("success", "Payout claim finalized. The contract emitted the funded GEN transfer."); }
  catch (error) { showError(error, "Payout claim did not complete."); }
  finally { busy.value = false; recovery.value = getPendingTransactions(); }
}
async function refund(policy: Policy): Promise<void> {
  busy.value = true;
  try { const result = await refundPolicy(policy.policy_id, walletAddress.value || ""); policies.value = await getPolicies(); selectedPolicy.value = result; showNotice("success", "Creator refund finalized. The exact escrow returned to the stored policy creator."); }
  catch (error) { showError(error, "Creator refund did not complete."); }
  finally { busy.value = false; recovery.value = getPendingTransactions(); }
}
function onAccountsChanged(accounts: unknown): void { const first = Array.isArray(accounts) ? accounts[0] : null; walletAddress.value = typeof first === "string" ? first : null; if (walletAddress.value && !form.value.beneficiary) form.value.beneficiary = walletAddress.value; }
onMounted(async () => { await refresh(); window.ethereum?.on?.("accountsChanged", onAccountsChanged); });
onBeforeUnmount(() => { window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged); });
</script>
