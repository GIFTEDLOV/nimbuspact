# Checks and coverage boundaries

Checks run against unchanged product source at `e27ebeb677f3ca8ad5f04b31b1a7fd659d9792c7` on Windows, Node 24.14.0 / Python 3.14.3. CI specifies Node 22 / Python 3.12, so this is not an assertion that CI was rerun.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run check` | Contract lint/validation, 31 direct tests, 35 frontend tests, typecheck PASS; build subprocess initially blocked by sandbox EPERM | checks-initial.txt |
| `npm run frontend:build` (approved subprocess retry) | PASS, Vite 6.4.3; 44.33s; advisory chunk >500 kB | build.txt |
| `python -X utf8 -m genvm_linter.cli validate contracts/nimbuspact.py` | PASS; 8 methods (4 view, 4 write); newer runner informational notice | genvm-validation.txt |
| `npm audit --json` | Zero vulnerabilities | audit-root.json |
| `npm audit --prefix app --json` | Zero vulnerabilities | audit-app.json |
| `python -m pip check` | No broken requirements | pip-check.txt |
| `python -m pip_audit --version` | Module not installed; Python CVE audit not performed | tool transcript; limitation |
| `git diff --check` | PASS, tracked product diff empty | final-repository-state.txt |
| `python scripts/scan-reviewer-evidence.py` | Pattern scan of tracked text plus evidence/scripts; no secret values printed | secret-scan.json |
| Local Studio connectivity read | ECONNREFUSED at http://127.0.0.1:4000/api | tool transcript; integration blocked |

`gltest tests/integration/ -v -s` was not run: Studio is unavailable and this suite deploys a contract. It was not redirected to Bradbury. No live contract deployment was made to satisfy a test.

No fresh-checkout/npm-ci reproduction was performed in this blocked pass. Both checked-in lockfiles and installed genlayer-js packages independently report 1.1.8. The existing checkout's build passed; it is not asserted to match production bytes because local build environment differs. GitHub deployment plus immutable production-asset matching supplies deployed source provenance independently.

## Required regression mapping

| Requirement | Existing test or remaining gap |
| --- | --- |
| Payable exact-value creation | test_empty_state_and_funded_policy; test_insufficient_funding_revert; frontend exact-value options test |
| Incorrect value rejected | Underpayment test passes; equality guard also rejects overpayment by source inspection; no separate overpayment test claimed |
| Early resolve cannot mutate outcomes | test_observation_boundaries_are_utc_and_early_resolution_is_rejected; status/attempts/digest checked |
| Window precedes web/nondeterminism | Source order confirmed; existing test does not explicitly spy on nondeterministic invocation, so additional regression needed |
| DATA_UNAVAILABLE retry | Retry-to-triggered and retry-to-not-triggered tests pass |
| Unavailable refund before/after grace | test_data_unavailable_cannot_refund_before_grace_and_can_refund_after_grace passes |
| NOT_TRIGGERED refund, duplicate refund | Creator refund and duplicate guard tests pass |
| Duplicate payout | Unauthorized claim / duplicate withdrawal guard test passes |
| Structured object errors | receipt_status and lifecycle_recovery tests pass |
| FINALIZED + failed execution not success | Receipt and lifecycle failure tests pass |
| Timeout resumes original hash, no automatic duplicate write | Saved-hash and nested-hash recovery tests pass |
| Normal rendering has no stale V1 warning | **Missing/failing requirement**: current UI test requires Historical V1 text; no rendered browser available |
| Exact V2 production configuration | Source allowlist tests pass; **actual fetched production environment fails** |
| version guard expects 2.0.0 | **Absent**, consistent with absent deployed version getter; not added as fabricated proof |

All direct tests are controlled Direct Mode evidence, not live validator/weather/transfer proof. Existing passing tests do not close the production configuration, version, expected-state recovery, rendered UI, or live rejection/recovery gaps.
