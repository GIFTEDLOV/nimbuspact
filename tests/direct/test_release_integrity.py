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
    assert tracked_sha256 == PROOF["source_deployment_sha256"]


def test_release_identity_matches_readme_env_and_live_proof():
    address = PROOF["contract_address"]
    rpc = PROOF["rpc_endpoint"]

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
