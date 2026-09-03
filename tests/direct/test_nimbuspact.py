"""Fast direct-mode tests for NimbusPact's policy and settlement rules."""

import json

from tests.direct.conftest import (
    AFTER_WINDOW_TIMESTAMP,
    CREATE_TIMESTAMP,
    END_DATE,
    PAYOUT,
    START_DATE,
    fund_policy,
    mock_weather,
    to_hex,
    weather_payload,
)


def deploy(direct_deploy):
    return direct_deploy("contracts/nimbuspact.py")


def test_empty_state_and_funded_policy(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    assert contract.get_policies() == {}
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    policy = contract.get_policy(policy_id)
    assert policy.policy_id == "p-1"
    assert policy.creator == to_hex(direct_alice)
    assert policy.beneficiary == to_hex(direct_bob)
    assert policy.status == "ACTIVE"
    assert policy.payout_amount == PAYOUT
    assert policy.resolution_attempts == 0
    assert policy.data_unavailable_since == 0
    assert policy.refunded is False
    assert policy.evidence_url.startswith("https://archive-api.open-meteo.com/v1/archive?")


def test_triggered_resolution_records_digest_and_result(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, weather_payload(precipitation=(10.0, 50.0, 49.999)))
    contract.resolve_policy(policy_id)
    policy = contract.get_policy(policy_id)
    assert policy.status == "TRIGGERED"
    assert policy.resolution_result == "TRIGGERED"
    assert policy.observed_value == "50.000"
    assert policy.resolution_code == "NONE"
    assert policy.resolution_attempts == 1
    assert policy.data_unavailable_since == 0
    assert len(policy.evidence_digest) == 64
    assert policy.withdrawn is False


def test_threshold_is_inclusive_and_below_threshold_is_not_triggered(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    triggered_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob, threshold="50")
    mock_weather(direct_vm, weather_payload(precipitation=(49.999, 50.0, 49.999)))
    contract.resolve_policy(triggered_id)
    assert contract.get_policy(triggered_id).status == "TRIGGERED"

    not_triggered_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob, threshold="50")
    mock_weather(direct_vm, weather_payload(precipitation=(49.999, 49.998, 49.997)))
    contract.resolve_policy(not_triggered_id)
    assert contract.get_policy(not_triggered_id).status == "NOT_TRIGGERED"


def test_all_allowlisted_metrics_resolve(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    heat_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob, trigger_type="EXTREME_HEAT", threshold="35")
    mock_weather(direct_vm, weather_payload(temperature=(34.0, 35.0, 33.0)))
    contract.resolve_policy(heat_id)
    assert contract.get_policy(heat_id).status == "TRIGGERED"

    storm_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob, trigger_type="SEVERE_STORM", threshold="80")
    mock_weather(direct_vm, weather_payload(wind=(79.0, 80.0, 70.0)))
    contract.resolve_policy(storm_id)
    assert contract.get_policy(storm_id).status == "TRIGGERED"


def test_malformed_weather_data_fails_closed_and_preserves_digest(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, body="not json")
    contract.resolve_policy(policy_id)
    policy = contract.get_policy(policy_id)
    assert policy.status == "DATA_UNAVAILABLE"
    assert policy.resolution_result == "DATA_UNAVAILABLE"
    assert policy.resolution_code == "INVALID_JSON"
    assert policy.resolution_attempts == 1
    assert policy.data_unavailable_since > 0
    assert len(policy.evidence_digest) == 64


def test_unavailable_source_never_becomes_positive(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, status=503, body="temporarily unavailable")
    contract.resolve_policy(policy_id)
    policy = contract.get_policy(policy_id)
    assert policy.status == "DATA_UNAVAILABLE"
    assert policy.resolution_code == "HTTP_STATUS"
    assert policy.observed_value == ""


def test_location_and_date_consistency_checks_fail_closed(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    location_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, weather_payload(latitude=7.5244))
    contract.resolve_policy(location_id)
    assert contract.get_policy(location_id).resolution_code == "LOCATION_MISMATCH"

    date_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, {**weather_payload(), "daily": {**weather_payload()["daily"], "time": [START_DATE, "2024-06-23", END_DATE]}})
    contract.resolve_policy(date_id)
    assert contract.get_policy(date_id).resolution_code == "DATE_MISMATCH"


def test_invalid_coordinates_dates_and_trigger_revert(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    direct_vm.warp(CREATE_TIMESTAMP)
    direct_vm.sender = direct_alice
    direct_vm.value = PAYOUT
    with direct_vm.expect_revert("Coordinates are outside the allowed bounds"):
        contract.create_policy("Lagos", "91", "3.3792", START_DATE, END_DATE, "HEAVY_RAIN", "50", to_hex(direct_bob), PAYOUT)
    with direct_vm.expect_revert("Invalid calendar date"):
        contract.create_policy("Lagos", "6.5244", "3.3792", "2024-02-30", END_DATE, "HEAVY_RAIN", "50", to_hex(direct_bob), PAYOUT)
    with direct_vm.expect_revert("Unsupported trigger type"):
        contract.create_policy("Lagos", "6.5244", "3.3792", START_DATE, END_DATE, "HAIL", "50", to_hex(direct_bob), PAYOUT)
    direct_vm.value = 0


def test_insufficient_funding_revert(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    direct_vm.warp(CREATE_TIMESTAMP)
    direct_vm.sender = direct_alice
    direct_vm.value = PAYOUT - 1
    with direct_vm.expect_revert("Funding must exactly equal the payout amount"):
        contract.create_policy("Lagos", "6.5244", "3.3792", START_DATE, END_DATE, "HEAVY_RAIN", "50", to_hex(direct_bob), PAYOUT)
    assert contract.get_policy_count() == 0
    direct_vm.value = 0


def test_duplicate_resolution_revert(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm)
    contract.resolve_policy(policy_id)
    with direct_vm.expect_revert("Policy is not resolvable in its current state"):
        contract.resolve_policy(policy_id)


def test_unauthorized_claim_revert_and_duplicate_withdrawal_guard(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, weather_payload(precipitation=(60.0, 0.0, 0.0)))
    contract.resolve_policy(policy_id)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only the beneficiary can claim this payout"):
        contract.claim_payout(policy_id)
    direct_vm.sender = direct_bob
    direct_vm.deal(direct_vm._contract_address, PAYOUT)
    contract.claim_payout(policy_id)
    assert contract.get_policy(policy_id).status == "CLAIMED"
    with direct_vm.expect_revert("Payout already claimed"):
        contract.claim_payout(policy_id)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Policy funds have already been claimed"):
        contract.refund_policy(policy_id)


def test_insufficient_contract_balance_is_retryable(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, weather_payload(precipitation=(60.0, 0.0, 0.0)))
    contract.resolve_policy(policy_id)

    direct_vm.deal(direct_vm._contract_address, PAYOUT - 1)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Insufficient contract balance for payout"):
        contract.claim_payout(policy_id)
    policy = contract.get_policy(policy_id)
    assert policy.status == "TRIGGERED"
    assert policy.withdrawn is False

    direct_vm.deal(direct_vm._contract_address, PAYOUT)
    contract.claim_payout(policy_id)
    policy = contract.get_policy(policy_id)
    assert policy.status == "CLAIMED"
    assert policy.withdrawn is True


def test_failed_execution_leaves_active_policy_unchanged(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    with direct_vm.expect_revert("Policy not found"):
        contract.resolve_policy("p-404")
    policy = contract.get_policy(policy_id)
    assert policy.status == "ACTIVE"
    assert policy.evidence_digest == ""


def test_adversarial_out_of_bounds_metric_is_unavailable(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, weather_payload(precipitation=(10.0, 9999.0, 10.0)))
    contract.resolve_policy(policy_id)
    policy = contract.get_policy(policy_id)
    assert policy.status == "DATA_UNAVAILABLE"
    assert policy.resolution_code == "VALUE_OUT_OF_BOUNDS"


def test_create_policy_rejects_retroactive_observation_window(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    direct_vm.warp(AFTER_WINDOW_TIMESTAMP)
    direct_vm.sender = direct_alice
    direct_vm.value = PAYOUT
    with direct_vm.expect_revert("Policy observation window must begin in the future"):
        contract.create_policy(
            "Lagos Island",
            "6.5244",
            "3.3792",
            START_DATE,
            END_DATE,
            "HEAVY_RAIN",
            "50",
            to_hex(direct_bob),
            PAYOUT,
        )
    direct_vm.value = 0
    assert contract.get_policy_count() == 0


def test_observation_boundaries_are_utc_and_early_resolution_is_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(
        direct_vm,
        contract,
        direct_alice,
        direct_bob,
        post_create_timestamp=None,
    )
    policy_before = contract.get_policy(policy_id)
    assert policy_before.observation_start_timestamp == 1718841600
    assert policy_before.observation_end_timestamp == 1719100800
    mock_weather(direct_vm, weather_payload(precipitation=(60.0, 0.0, 0.0)))
    with direct_vm.expect_revert("Observation window is still open"):
        contract.resolve_policy(policy_id)
    unchanged = contract.get_policy(policy_id)
    assert unchanged.status == "ACTIVE"
    assert unchanged.resolution_attempts == 0
    assert unchanged.evidence_digest == ""

    direct_vm.warp(AFTER_WINDOW_TIMESTAMP)
    contract.resolve_policy(policy_id)
    assert contract.get_policy(policy_id).status == "TRIGGERED"


def test_not_triggered_creator_refund_and_duplicate_refund_guard(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, weather_payload(precipitation=(49.999, 49.998, 49.997)))
    contract.resolve_policy(policy_id)
    direct_vm.deal(direct_vm._contract_address, PAYOUT)
    direct_vm.sender = direct_alice
    contract.refund_policy(policy_id)
    policy = contract.get_policy(policy_id)
    assert policy.status == "REFUNDED"
    assert policy.refunded is True
    assert policy.withdrawn is True
    with direct_vm.expect_revert("Policy has already been refunded"):
        contract.refund_policy(policy_id)
    with direct_vm.expect_revert("Policy has already been refunded"):
        contract.claim_payout(policy_id)


def test_not_triggered_beneficiary_cannot_claim_and_non_creator_cannot_refund(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, weather_payload(precipitation=(49.999, 49.998, 49.997)))
    contract.resolve_policy(policy_id)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Policy is not payout eligible"):
        contract.claim_payout(policy_id)
    with direct_vm.expect_revert("Only the policy creator can claim a refund"):
        contract.refund_policy(policy_id)


def test_data_unavailable_retry_to_triggered_blocks_refund_and_allows_claim(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    original = contract.get_policy(policy_id)
    mock_weather(direct_vm, body="not json")
    contract.resolve_policy(policy_id)
    unavailable = contract.get_policy(policy_id)
    assert unavailable.status == "DATA_UNAVAILABLE"
    assert unavailable.resolution_attempts == 1
    first_digest = unavailable.evidence_digest
    first_since = unavailable.data_unavailable_since

    direct_vm.warp("2024-06-23T01:00:00Z")
    mock_weather(direct_vm, weather_payload(precipitation=(60.0, 0.0, 0.0)))
    contract.resolve_policy(policy_id)
    triggered = contract.get_policy(policy_id)
    assert triggered.status == "TRIGGERED"
    assert triggered.resolution_attempts == 2
    assert triggered.data_unavailable_since == 0
    assert triggered.creator == original.creator
    assert triggered.beneficiary == original.beneficiary
    assert triggered.payout_amount == original.payout_amount
    assert triggered.evidence_digest != first_digest
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Policy is not refund eligible"):
        contract.refund_policy(policy_id)
    direct_vm.sender = direct_bob
    direct_vm.deal(direct_vm._contract_address, PAYOUT)
    contract.claim_payout(policy_id)
    assert contract.get_policy(policy_id).status == "CLAIMED"


def test_data_unavailable_retry_to_not_triggered_allows_creator_refund(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, body="not json")
    contract.resolve_policy(policy_id)
    direct_vm.warp("2024-06-23T01:00:00Z")
    mock_weather(direct_vm, weather_payload(precipitation=(49.999, 49.998, 49.997)))
    contract.resolve_policy(policy_id)
    policy = contract.get_policy(policy_id)
    assert policy.status == "NOT_TRIGGERED"
    assert policy.resolution_attempts == 2
    assert policy.data_unavailable_since == 0
    direct_vm.sender = direct_alice
    direct_vm.deal(direct_vm._contract_address, PAYOUT)
    contract.refund_policy(policy_id)
    assert contract.get_policy(policy_id).status == "REFUNDED"


def test_data_unavailable_cannot_refund_before_grace_and_can_refund_after_grace(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, body="not json")
    contract.resolve_policy(policy_id)
    direct_vm.sender = direct_alice
    direct_vm.warp("2024-06-23T23:00:00Z")
    with direct_vm.expect_revert("Refund is not eligible until the recovery grace period expires"):
        contract.refund_policy(policy_id)
    assert contract.get_policy(policy_id).status == "DATA_UNAVAILABLE"

    direct_vm.warp("2024-06-24T00:00:00Z")
    direct_vm.deal(direct_vm._contract_address, PAYOUT)
    contract.refund_policy(policy_id)
    assert contract.get_policy(policy_id).status == "REFUNDED"
    with direct_vm.expect_revert("Policy has already been refunded"):
        contract.resolve_policy(policy_id)


def test_data_unavailable_retry_is_bounded_after_grace(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, body="not json")
    contract.resolve_policy(policy_id)
    direct_vm.warp("2024-06-24T00:00:00Z")
    with direct_vm.expect_revert("DATA_UNAVAILABLE recovery grace period has expired"):
        contract.resolve_policy(policy_id)


def test_refund_solvency_guard_preserves_not_triggered_state(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    policy_id, _ = fund_policy(direct_vm, contract, direct_alice, direct_bob)
    mock_weather(direct_vm, weather_payload(precipitation=(49.999, 49.998, 49.997)))
    contract.resolve_policy(policy_id)
    direct_vm.deal(direct_vm._contract_address, PAYOUT - 1)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Insufficient contract balance for refund"):
        contract.refund_policy(policy_id)
    assert contract.get_policy(policy_id).status == "NOT_TRIGGERED"
    direct_vm.deal(direct_vm._contract_address, PAYOUT)
    contract.refund_policy(policy_id)
    assert contract.get_policy(policy_id).status == "REFUNDED"
