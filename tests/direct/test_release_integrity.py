"""Release-level parity checks for the proven Bradbury deployment."""

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "contracts" / "nimbuspact.py"
README_PATH = ROOT / "README.md"
ENV_PATH = ROOT / "app" / ".env.example"
PROOF_PATH = ROOT / "docs" / "live-proof" / "bradbury-smoke.json"

EXPECTED_CONTRACT_SHA256 = "1a6386e22ffc60d8beae3640569bf25ec6582c7896bb565bb1b161b96810e310"
EXPECTED_CONTRACT_ADDRESS = "0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934"
EXPECTED_DEPLOYMENT_HASH = "0xf02ddbb1fa117ad1dbbabf32dfc41f912fb7d4ac42eda77e9f5130c8186610db"
EXPECTED_PRIOR_REVERTED_CLAIM = "0xbe2fd099ec7f1b52db4a412bd2b587006c237a6ccf6aa516467f430d695c6d6b"

CONTRACT = CONTRACT_PATH.read_text(encoding="utf-8")
README = README_PATH.read_text(encoding="utf-8")
ENV = ENV_PATH.read_text(encoding="utf-8")
PROOF = json.loads(PROOF_PATH.read_text(encoding="utf-8"))

EXPECTED_PUBLIC_METHODS = {
    "create_policy",
    "resolve_policy",
    "claim_payout",
    "get_policy",
    "get_policies",
    "get_policy_ids",
    "get_policy_count",
}


def test_deployed_source_hash_matches_tracked_contract():
    tracked_sha256 = hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()
    assert tracked_sha256 == EXPECTED_CONTRACT_SHA256
    assert PROOF["source_deployment_sha256"] == EXPECTED_CONTRACT_SHA256


def test_release_identity_matches_readme_env_and_live_proof():
    address = PROOF["contract_address"]
    rpc = PROOF["rpc_endpoint"]

    assert address == EXPECTED_CONTRACT_ADDRESS
    assert PROOF["deployment_hash"] == EXPECTED_DEPLOYMENT_HASH
    assert PROOF["network"] == "Testnet Bradbury"
    assert address in README
    assert rpc in README
    assert "https://nimbuspact.vercel.app" in README
    assert "https://github.com/GIFTEDLOV/nimbuspact" in README

    assert f'VITE_CONTRACT_ADDRESS="{address}"' in ENV
    assert 'VITE_GENLAYER_NETWORK="testnetBradbury"' in ENV
    assert f'VITE_GENLAYER_RPC_URL="{rpc}"' in ENV


def test_readme_public_interface_matches_contract():
    methods = set(
        re.findall(
            r"@gl\.public\.(?:view|write(?:\.payable)?)\s*\n\s*def\s+(\w+)\s*\(",
            CONTRACT,
        )
    )
    assert methods == EXPECTED_PUBLIC_METHODS
    for method in EXPECTED_PUBLIC_METHODS:
        assert f"`{method}(" in README


def test_live_proof_is_terminal_success_and_internally_consistent():
    deployment = PROOF["deployment"]
    final_state = PROOF["policy_final_state"]
    settlement = PROOF["settlement"]
    claim = PROOF["smoke"]["claim"]

    assert deployment["status"] == "FINALIZED"
    assert deployment["execution_result"] == "FINISHED_WITH_RETURN"
    assert deployment["consensus_result"] == "AGREE"
    assert settlement["settlement_verified"] is True
    assert settlement["contract_balance_after_wei"] == "0"
    assert final_state["status"] == "CLAIMED"
    assert final_state["withdrawn"] is True
    assert final_state["duplicate_claim_blocked"] is True
    assert claim["policy_status"] == final_state["status"]
    assert claim["withdrawn"] == final_state["withdrawn"]


def test_live_proof_preserves_settlement_and_failed_attempt_disclosure():
    settlement = PROOF["settlement"]
    prior = PROOF["prior_reverted_claim"]

    assert settlement["payout_amount_wei"] == "100000000000000000"
    assert settlement["gross_settlement_amount_wei"] == "100000000000000000"
    assert settlement["observed_net_balance_delta_wei"] == "99701203127665900"
    assert settlement["separate_child_receipt"] is False
    assert settlement["settlement_verified"] is True
    assert prior["hash"] == EXPECTED_PRIOR_REVERTED_CLAIM
    assert prior["receipt_status"] == "0x0"
    assert "not successful" in prior["classification"]
    assert EXPECTED_PRIOR_REVERTED_CLAIM in README
    assert "not" in README[README.index(EXPECTED_PRIOR_REVERTED_CLAIM):README.index(EXPECTED_PRIOR_REVERTED_CLAIM) + 300].lower()


def test_contract_trigger_and_terminal_economics_are_documented():
    assert 'TRIGGER_HEAVY_RAIN = "HEAVY_RAIN"' in CONTRACT
    assert 'TRIGGER_EXTREME_HEAT = "EXTREME_HEAT"' in CONTRACT
    assert 'TRIGGER_SEVERE_STORM = "SEVERE_STORM"' in CONTRACT
    assert "MAX_WINDOW_DAYS = 31" in CONTRACT
    assert "maximum_value >= threshold_value" in CONTRACT
    assert 'if policy.status != STATUS_ACTIVE:' in CONTRACT
    assert 'if policy.status != STATUS_TRIGGERED:' in CONTRACT
    assert "no creator refund" in README.lower()
    assert "DATA_UNAVAILABLE" in README
    assert "NOT_TRIGGERED" in README


def test_stale_provenance_links_are_absent():
    assert "genlayer-weather-oracle" not in README
    assert "uptimebond" not in README.lower()
