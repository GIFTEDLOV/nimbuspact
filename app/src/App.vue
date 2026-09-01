<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="NimbusPact home">
        <span class="brand-mark"><CloudRain :size="20" stroke-width="2.4" /></span>
        <span>Nimbus<span class="brand-accent">Pact</span></span>
      </a>

      <nav class="nav-links" aria-label="Main navigation">
        <a href="#coverage">Coverage</a>
        <a href="#how-it-works">How it works</a>
        <a href="#technical">Technical details</a>
      </nav>

      <button class="wallet-button" :class="{ connected: walletAddress }" @click="handleWallet">
        <WalletCards :size="17" />
        {{ walletAddress ? shortAddress(walletAddress) : "Connect wallet" }}
      </button>
    </header>

    <main id="top">
      <section class="hero section-width">
        <div class="hero-copy">
          <div class="eyebrow"><span class="pulse-dot"></span> Consensus-backed weather coverage</div>
          <h1>When the weather crosses the line, <em>your cover moves.</em></h1>
          <p class="hero-lede">
            Fund a policy for a real location, let GenLayer validators inspect the same public weather evidence,
            and claim a payout only when the finalized on-chain decision says the trigger happened.
          </p>
          <div class="hero-actions">
            <a class="primary-button" href="#create">Create a policy <ArrowDownRight :size="17" /></a>
            <a class="text-link" href="#how-it-works">See how settlement works <ArrowUpRight :size="15" /></a>
          </div>
          <div class="trust-line"><ShieldCheck :size="16" /> No centralized weather decision-maker</div>
        </div>

        <div class="hero-card" aria-label="Bradbury smoke proof snapshot">
          <div class="hero-card-top"><span class="tiny-label">BRADBURY PROOF SNAPSHOT</span><span class="status-tag tag-triggered">FINALIZED</span></div>
          <div class="weather-icon"><CloudLightning :size="36" /></div>
          <div class="hero-location">Lagos, NG <span>·</span> 06°31'N 03°23'E</div>
          <div class="hero-trigger">Heavy rain cover</div>
          <div class="hero-metric-row"><strong>1.900 mm</strong><span>observed peak</span></div>
          <div class="threshold-track"><span style="width: 100%"></span></div>
          <div class="track-labels"><span>Threshold 0.000 mm</span><span class="success-copy">Trigger confirmed</span></div>
          <div class="hero-card-footer"><span>0xEAA6…C934</span><span>p-1</span><span>0.10 GEN funded</span></div>
        </div>
      </section>

      <section class="stats section-width" aria-label="NimbusPact overview">
        <div class="stat-card"><span>Policies on-chain</span><strong>{{ policies.length.toString().padStart(2, "0") }}</strong><small>Directly readable from the IC</small></div>
        <div class="stat-card"><span>Funded coverage</span><strong>{{ totalFunded }}</strong><small>GEN committed to policies</small></div>
        <div class="stat-card"><span>Fixed evidence source</span><strong class="source-stat">Open-Meteo</strong><small>Archive API · UTC daily data</small></div>
        <div class="stat-card"><span>Settlement rule</span><strong class="source-stat">Finalized only</strong><small>Consensus success before state read</small></div>
      </section>

      <section id="coverage" class="workspace section-width">
        <div class="section-heading">
          <div><span class="section-kicker">Coverage desk</span><h2>Your weather policies</h2></div>
          <button class="quiet-button" :disabled="loading" @click="refresh"><RefreshCw :class="{ spinning: loading }" :size="15" /> {{ recovery.length ? "Check again" : "Refresh state" }}</button>
        </div>

        <div v-if="notice" class="notice" :class="`notice-${notice.kind}`" role="status">
          <component :is="notice.kind === 'success' ? CircleCheck : AlertTriangle" :size="18" />
          <span>{{ notice.message }}</span>
          <button class="notice-close" aria-label="Dismiss message" @click="notice = null">×</button>
        </div>

        <div class="workspace-grid">
          <section id="create" class="panel create-panel">
            <div class="panel-heading"><div><span class="section-kicker">New cover</span><h3>Fund a policy</h3></div><span class="step-count">01 / 03</span></div>
            <p class="panel-intro">Set one clear condition. The contract builds the fixed Open-Meteo evidence URL from these validated fields.</p>
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
                <label class="field"><span>Trigger type</span><select v-model="form.triggerType" @change="syncThreshold"><option value="HEAVY_RAIN">Heavy rain</option><option value="EXTREME_HEAT">Extreme heat</option><option value="SEVERE_STORM">Severe storm</option></select></label>
                <label class="field"><span>Threshold <small>{{ thresholdUnit }}</small></span><input v-model.trim="form.threshold" inputmode="decimal" required /></label>
              </div>
              <label class="field full-field"><span>Beneficiary address</span><input v-model.trim="form.beneficiary" required placeholder="0x…" /></label>
              <label class="field full-field"><span>Payout amount <small>GEN</small></span><div class="amount-input"><input v-model.trim="form.payout" inputmode="decimal" required placeholder="0.25" /><span>GEN</span></div></label>
              <div class="funding-note"><LockKeyhole :size="15" /><span>Creating sends the exact payout amount to the contract. It cannot be withdrawn by the creator.</span></div>
              <button class="submit-button" type="submit" :disabled="busy || !configured || !walletAddress">
                <LoaderCircle v-if="busy" class="spinning" :size="17" /><span v-else>Fund policy</span><ArrowUpRight v-if="!busy" :size="16" />
              </button>
              <p v-if="!configured" class="form-hint warning-copy">Add VITE_CONTRACT_ADDRESS to connect this interface to a deployed NimbusPact IC.</p>
              <p v-else-if="!walletAddress" class="form-hint">Connect a wallet to fund a policy on {{ networkLabel }}.</p>
            </form>
          </section>

          <section class="policy-column">
            <div v-if="recovery.length" class="recovery-banner"><Clock3 :size="17" /><div><strong>Pending transaction recovery</strong><span>{{ recovery.length }} transaction{{ recovery.length === 1 ? "" : "s" }} remain linked to the original hash{{ recovery.length === 1 ? " " + shortHash(recovery[0]?.hash || "") : "es" }}. No replacement transaction will be sent automatically.</span></div><button class="inline-button" :disabled="loading" @click="refresh"><RefreshCw :size="14" /> Check again</button></div>
            <div v-if="!policies.length && !loading" class="empty-state"><CloudSun :size="30" /><h3>No policies yet</h3><p>Fund the first policy and this desk will show its full settlement trail.</p></div>
            <article v-for="policy in policies" :key="policy.policy_id" class="policy-card" :class="{ selected: selectedPolicy?.policy_id === policy.policy_id }" @click="selectPolicy(policy)">
              <div class="policy-card-header"><span class="policy-id">{{ policy.policy_id }}</span><span class="status-tag" :class="statusClass(policy.status)">{{ statusLabel(policy.status) }}</span></div>
              <div class="policy-main"><div><h3>{{ policy.location_name }}</h3><p>{{ triggerLabel(policy.trigger_type) }} · {{ policy.start_date }} → {{ policy.end_date }}</p></div><strong>{{ formatGen(policy.payout_amount) }} <small>GEN</small></strong></div>
              <div class="policy-rule"><span>{{ policy.metric }}</span><span>≥ {{ policy.threshold }} {{ metricUnit(policy.metric) }}</span><span class="rule-arrow">→</span></div>
              <div class="policy-card-footer"><span>Beneficiary {{ shortAddress(policy.beneficiary) }}</span><button v-if="policy.status === 'ACTIVE'" class="inline-button" :disabled="busy" @click.stop="resolve(policy)"><Radar :size="14" /> Resolve</button><button v-else-if="policy.status === 'TRIGGERED' && !policy.withdrawn" class="inline-button claim" :disabled="busy" @click.stop="claim(policy)"><HandCoins :size="14" /> Claim payout</button><span v-else>{{ policy.status === "CLAIMED" ? "Payout claimed" : "Resolution recorded" }}</span></div>
            </article>
          </section>
        </div>
      </section>

      <section v-if="selectedPolicy" class="detail-section section-width" aria-live="polite">
        <div class="detail-heading"><div><span class="section-kicker">Policy detail</span><h2>{{ selectedPolicy.location_name }} <span class="muted-id">{{ selectedPolicy.policy_id }}</span></h2></div><span class="status-tag" :class="statusClass(selectedPolicy.status)">{{ statusLabel(selectedPolicy.status) }}</span></div>
        <div class="detail-grid">
          <div class="detail-box"><span class="detail-label">Resolution result</span><strong>{{ resultTitle(selectedPolicy) }}</strong><p>{{ resultDescription(selectedPolicy) }}</p><div v-if="selectedPolicy.observed_value" class="observed-value">Observed peak <b>{{ selectedPolicy.observed_value }} {{ metricUnit(selectedPolicy.metric) }}</b></div></div>
          <div class="detail-box"><span class="detail-label">Evidence commitment</span><strong>{{ selectedPolicy.evidence_digest ? "Digest recorded" : "Awaiting resolution" }}</strong><p>Validators inspect the fixed Open-Meteo URL constructed from this policy’s location and dates.</p><code v-if="selectedPolicy.evidence_digest">sha256:{{ selectedPolicy.evidence_digest }}</code><a :href="selectedPolicy.evidence_url" target="_blank" rel="noreferrer">View fixed evidence URL <ArrowUpRight :size="13" /></a></div>
          <div class="detail-box"><span class="detail-label">Payout state</span><strong>{{ selectedPolicy.withdrawn ? "Transferred" : selectedPolicy.status === "TRIGGERED" ? "Claimable" : "Locked" }}</strong><p>Only the beneficiary can claim, and only after a successful finalized trigger resolution.</p><span class="beneficiary-chip"><UserRound :size="14" /> {{ shortAddress(selectedPolicy.beneficiary) }}</span></div>
        </div>
      </section>

      <section id="how-it-works" class="how-section section-width">
        <div class="how-intro"><span class="section-kicker">The settlement path</span><h2>A weather decision with a receipt.</h2><p>Every write is treated as a lifecycle, not a fire-and-forget button. The UI saves the hash, waits for finality, verifies successful execution, then reads the expected policy state.</p></div>
        <div class="steps"><div class="step"><span>01</span><ShieldCheck :size="20" /><h3>Fund</h3><p>Your wallet sends exactly the stated payout amount to the payable IC.</p></div><div class="step"><span>02</span><Radar :size="20" /><h3>Resolve</h3><p>Validators independently fetch the same constructed Open-Meteo evidence URL.</p></div><div class="step"><span>03</span><CircleCheck :size="20" /><h3>Claim</h3><p>A triggered result becomes pull-claimable for the beneficiary after finalization.</p></div></div>
      </section>

      <section id="technical" class="technical-section section-width">
        <div><span class="section-kicker">Built for auditability</span><h2>Small surface. Explicit trust boundary.</h2></div>
        <div class="technical-copy"><p>NimbusPact keeps the consensus-critical question inside the Intelligent Contract: did the selected metric cross the selected threshold during the selected window? Inputs are bounded, evidence is normalized deterministically, and the final digest is stored with the result.</p><div class="technical-pills"><span><Code2 :size="14" /> Strict equality consensus</span><span><Database :size="14" /> No backend or oracle server</span><span><Fingerprint :size="14" /> SHA-256 evidence digest</span></div></div>
      </section>
    </main>

    <footer class="footer section-width"><span>© 2026 NimbusPact</span><span>Project contribution · Parametric weather coverage</span><a href="https://github.com/GIFTEDLOV/genlayer-weather-oracle" target="_blank" rel="noreferrer">Provenance & sources <ArrowUpRight :size="13" /></a></footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleCheck, CloudLightning, CloudRain, CloudSun, Clock3, Code2, Database, Fingerprint, HandCoins, LoaderCircle, LockKeyhole, Radar, RefreshCw, ShieldCheck, UserRound, WalletCards } from "lucide-vue-next";
import { claimPayout, connectWallet, createPolicy, getContractAddress, getNetworkLabel, getPendingTransactions, getPolicies, recoverPendingTransactions, resolvePolicy, type NoticeKind, type Policy, type PolicyInput } from "./lib/nimbuspact";
import { policyStatusMessage } from "./lib/receiptStatus";

const configured = Boolean(getContractAddress());
const networkLabel = getNetworkLabel();
const walletAddress = ref<string | null>(null);
const policies = ref<Policy[]>([]);
const selectedPolicy = ref<Policy | null>(null);
const loading = ref(false);
const busy = ref(false);
const recovery = ref(getPendingTransactions());
const notice = ref<{ kind: NoticeKind; message: string } | null>(null);

function dateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const end = new Date();
end.setDate(end.getDate() - 1);
const start = new Date(end);
start.setDate(start.getDate() - 6);
const form = ref<PolicyInput>({ locationName: "Lagos Island", latitude: "6.5244", longitude: "3.3792", startDate: dateString(start), endDate: dateString(end), triggerType: "HEAVY_RAIN", threshold: "50", beneficiary: "", payout: "0.25" });

const thresholdUnit = computed(() => form.value.triggerType === "HEAVY_RAIN" ? "mm" : form.value.triggerType === "EXTREME_HEAT" ? "°C" : "km/h");
const totalFunded = computed(() => `${policies.value.reduce((total, policy) => total + Number(formatGen(policy.payout_amount)), 0).toFixed(2)} GEN`);

function shortAddress(address: string): string { return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not set"; }
function shortHash(hash: string): string { return hash ? `${hash.slice(0, 10)}…` : "not available"; }
function formatGen(value: string): string { const amount = BigInt(value || "0"); const whole = amount / 1000000000000000000n; const fraction = (amount % 1000000000000000000n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, ""); return fraction ? `${whole}.${fraction}` : whole.toString(); }
function triggerLabel(trigger: string): string { return trigger === "HEAVY_RAIN" ? "Heavy rain" : trigger === "EXTREME_HEAT" ? "Extreme heat" : "Severe storm"; }
function metricUnit(metric: string): string { return metric === "PRECIPITATION_MM" ? "mm" : metric === "TEMPERATURE_MAX_C" ? "°C" : "km/h"; }
function statusLabel(status: string): string { return status === "ACTIVE" ? "Active" : status === "TRIGGERED" ? "Triggered" : status === "NOT_TRIGGERED" ? "Not triggered" : status === "DATA_UNAVAILABLE" ? "Data unavailable" : "Claimed"; }
function statusClass(status: string): string { return `status-${status.toLowerCase()}`; }
function resultTitle(policy: Policy): string { return policy.status === "TRIGGERED" || policy.status === "CLAIMED" ? "Weather trigger confirmed" : policy.status === "NOT_TRIGGERED" ? "Threshold not crossed" : policy.status === "DATA_UNAVAILABLE" ? "Evidence unavailable" : "Awaiting resolution"; }
function resultDescription(policy: Policy): string { return policyStatusMessage(policy.status); }
function showNotice(kind: NoticeKind, message: string): void { notice.value = { kind, message }; }

async function handleWallet(): Promise<void> {
  if (walletAddress.value) return;
  try { walletAddress.value = await connectWallet(); if (!form.value.beneficiary) form.value.beneficiary = walletAddress.value; showNotice("success", `Wallet connected on ${networkLabel}.`); }
  catch (error) { showNotice("error", error instanceof Error ? error.message : "Wallet connection was not completed."); }
}
async function refresh(): Promise<void> {
  if (!configured) return;
  loading.value = true;
  try { const recovered = await recoverPendingTransactions(); recovery.value = getPendingTransactions(); if (recovered.length) showNotice(recovered[0].kind, recovered[0].message); policies.value = await getPolicies(); if (selectedPolicy.value) selectedPolicy.value = policies.value.find((policy) => policy.policy_id === selectedPolicy.value?.policy_id) ?? null; }
  catch (error) { showNotice("error", error instanceof Error ? error.message : "Could not read NimbusPact state."); }
  finally { loading.value = false; }
}
function syncThreshold(): void { form.value.threshold = form.value.triggerType === "HEAVY_RAIN" ? "50" : form.value.triggerType === "EXTREME_HEAT" ? "35" : "80"; }
function selectPolicy(policy: Policy): void { selectedPolicy.value = policy; }
async function submitCreate(): Promise<void> {
  if (!walletAddress.value) { showNotice("error", "Connect the beneficiary or creator wallet before funding a policy."); return; }
  busy.value = true;
  try { const policy = await createPolicy({ ...form.value, beneficiary: form.value.beneficiary || walletAddress.value }, walletAddress.value); policies.value = await getPolicies(); selectedPolicy.value = policy; showNotice("success", `${policy.policy_id} was finalized and funded.`); }
  catch (error) { showNotice("error", error instanceof Error ? error.message : "The policy transaction did not complete."); }
  finally { busy.value = false; recovery.value = getPendingTransactions(); }
}
async function resolve(policy: Policy): Promise<void> {
  busy.value = true;
  try { const result = await resolvePolicy(policy.policy_id, walletAddress.value || ""); policies.value = await getPolicies(); selectedPolicy.value = result; showNotice(result.status === "TRIGGERED" ? "success" : result.status === "DATA_UNAVAILABLE" ? "warning" : "success", result.status === "TRIGGERED" ? "Validators finalized a triggered result. The payout is now claimable by the beneficiary." : result.status === "DATA_UNAVAILABLE" ? "The source was unavailable or malformed. No positive trigger was recorded." : "Validators finalized a non-triggered result. No payout is due."); }
  catch (error) { showNotice("error", error instanceof Error ? error.message : "Resolution did not finalize successfully."); }
  finally { busy.value = false; recovery.value = getPendingTransactions(); }
}
async function claim(policy: Policy): Promise<void> {
  busy.value = true;
  try { const result = await claimPayout(policy.policy_id, walletAddress.value || ""); policies.value = await getPolicies(); selectedPolicy.value = result; showNotice("success", "Payout claim finalized. The contract emitted the funded GEN transfer."); }
  catch (error) { showNotice("error", error instanceof Error ? error.message : "Payout claim did not complete."); }
  finally { busy.value = false; recovery.value = getPendingTransactions(); }
}
function onAccountsChanged(accounts: unknown): void { const first = Array.isArray(accounts) ? accounts[0] : null; walletAddress.value = typeof first === "string" ? first : null; if (walletAddress.value && !form.value.beneficiary) form.value.beneficiary = walletAddress.value; }
onMounted(async () => { await refresh(); window.ethereum?.on?.("accountsChanged", onAccountsChanged); });
onBeforeUnmount(() => { window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged); });
</script>
