# Normal-resolution preflight

Read-only Bradbury preflight captured at `2026-09-07T08:10:31.876Z`.

- Chain time: `1788768632` (`2026-09-07T08:10:32Z`).
- Policy `p-1`: `ACTIVE`, creator and beneficiary `0x4f7a14c8cd83caa18Fafc35aA91a8483Cc95E3E5`.
- Observation end: `1788739200` (`2026-09-07T00:00:00Z`); window closed by `29432` seconds at capture.
- Payout: `10000000000000000` wei; resolution attempts `0`; withdrawn `false`; refunded `false`.
- Contract balance: `0x2386f26fc10000` at both `latest` and `finalized`, equal to `0.01` GEN.
- The finalized early rejection `0xe92dc923a045911f896fff3cb5a64e640bc9234d2a0ebd38142bc5c49d140b2c` is recorded as `FINISHED_WITH_ERROR` with `Observation window is still open`; its state-unchanged and protected-escrow evidence remains intact.

The production UI exposes `Resolve` for an ACTIVE policy once its observation window is closed. `app/src/App.vue` applies that display condition and `resolve()` guard; `app/src/lib/nimbuspact.ts` applies the same precondition before writing `resolve_policy`. The lifecycle action key is `resolve:p-1`; `runLifecycle()` checks `nimbuspact.pending.v2`, reuses an existing saved hash, and never rebroadcasts automatically.

No `resolve:p-1` pending entry appears in the saved repository evidence. Browser localStorage is client-local, and no browser session was attached for direct storage inspection; therefore the artifact records that limitation. No transaction was broadcast during this preflight.
