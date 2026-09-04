import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../../app/src/App.vue", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../../app/src/style.css", import.meta.url), "utf8");

test("product landing and navigation lead with the cover proposition", () => {
  for (const copy of ["Cover the weather", "Create cover", "How settlement works", "Public evidence", "Exact escrow"]) {
    assert.match(appSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(appSource, /Overview/);
  assert.match(appSource, /My covers/);
  assert.match(appSource, /Trust model/);
});

test("create cover is a compact three-step flow with an exact escrow review", () => {
  for (const step of ["Condition", "Payout", "Review", "Fund cover"]) assert.match(appSource, new RegExp(step));
  assert.match(appSource, /exact payable value shown above/);
  assert.match(appSource, /network transaction charge separately/);
  assert.match(appSource, /createStep === 3 \? submitCreate\(\)/);
});

test("GenLayer transaction presentation includes finality and neutral pending copy", () => {
  assert.match(appSource, /"Submitted", "Consensus", "Accepted", "Finality window", "Finalized"/);
  assert.match(appSource, /Still awaiting finality/);
  assert.match(appSource, /leave this page safely/);
  assert.match(appSource, /will never submit a duplicate automatically/);
  assert.doesNotMatch(appSource, /Submission recovery is active/);
  assert.doesNotMatch(appSource, /Transaction request failed/);
  assert.match(styleSource, /\.transaction-pending, \.transaction-submitted/);
});

test("cover states expose human actions without raw enum-first presentation", () => {
  for (const state of ["ACTIVE", "TRIGGERED", "NOT_TRIGGERED", "DATA_UNAVAILABLE", "REFUNDED"]) assert.match(appSource, new RegExp(state));
  for (const action of ["Observation in progress", "Retry verification", "Claim payout", "Claim refund"]) assert.match(appSource, new RegExp(action));
  assert.match(appSource, /Evidence unavailable/);
  assert.match(appSource, /Observation closes/);
  assert.match(appSource, /Refund available after/);
  assert.match(appSource, /class="coverage-layout"/);
  assert.match(appSource, /label: "Verification"/);
  assert.match(appSource, /View details/);
  assert.match(appSource, /readableDateRange/);
  assert.doesNotMatch(appSource, /formatUtcTimestamp/);
  assert.match(styleSource, /\.coverage-layout \{ display: grid/);
});

test("technical diagnostics are collapsed and user-facing error copy is safe", () => {
  assert.match(appSource, /<details v-if="notice\.diagnostic" class="technical-details/);
  assert.match(appSource, /<details class="technical-details evidence-details"/);
  assert.match(appSource, /normalizeNetworkError/);
  assert.doesNotMatch(appSource, /\[object Object\]/i);
});

test("V2 proof is present while historical V1 is explicitly demoted", () => {
  assert.match(appSource, /V2 live proof/);
  assert.match(appSource, /0x055F97140CE35FD1e656ebb3D204952A46646681/);
  assert.match(appSource, /Developer proof and release history/);
  assert.match(appSource, /Historical V1/);
  assert.match(appSource, /Superseded rejected release\. Not active\./);
});

test("responsive and accessible presentation safeguards are defined", () => {
  assert.match(appSource, /aria-label="Main navigation"/);
  assert.match(appSource, /role="dialog" aria-modal="true"/);
  assert.match(appSource, /aria-live="polite"/);
  assert.match(appSource, /@keydown\.space\.prevent="selectPolicy\(policy\)"/);
  assert.match(styleSource, /focus-visible/);
  assert.match(styleSource, /prefers-reduced-motion: reduce/);
  for (const breakpoint of ["1080px", "780px", "480px"]) assert.match(styleSource, new RegExp(`max-width: ${breakpoint}`));
  assert.match(styleSource, /overflow-x: hidden/);
});
