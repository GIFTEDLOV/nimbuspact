# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import hashlib
import json
from dataclasses import dataclass

from genlayer import *


SOURCE_NAME = "Open-Meteo Archive API"
SOURCE_BASE_URL = "https://archive-api.open-meteo.com/v1/archive"
MAX_WINDOW_DAYS = 31

TRIGGER_HEAVY_RAIN = "HEAVY_RAIN"
TRIGGER_EXTREME_HEAT = "EXTREME_HEAT"
TRIGGER_SEVERE_STORM = "SEVERE_STORM"
ALLOWED_TRIGGERS = (
    TRIGGER_HEAVY_RAIN,
    TRIGGER_EXTREME_HEAT,
    TRIGGER_SEVERE_STORM,
)

STATUS_ACTIVE = "ACTIVE"
STATUS_TRIGGERED = "TRIGGERED"
STATUS_NOT_TRIGGERED = "NOT_TRIGGERED"
STATUS_DATA_UNAVAILABLE = "DATA_UNAVAILABLE"
STATUS_CLAIMED = "CLAIMED"


@allow_storage
@dataclass
class Policy:
    policy_id: str
    creator: str
    beneficiary: str
    location_name: str
    latitude: str
    longitude: str
    start_date: str
    end_date: str
    trigger_type: str
    metric: str
    threshold: str
    payout_amount: u256
    status: str
    evidence_url: str
    evidence_digest: str
    resolution_result: str
    observed_value: str
    resolution_code: str
    withdrawn: bool


@gl.evm.contract_interface
class NativeRecipient:
    class View:
        pass

    class Write:
        pass


def _fail(message: str) -> None:
    raise gl.vm.UserError(message)


def _is_leap_year(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _days_in_month(year: int, month: int) -> int:
    if month == 2:
        return 29 if _is_leap_year(year) else 28
    if month in (4, 6, 9, 11):
        return 30
    return 31


def _parse_date(value: str) -> tuple:
    if not isinstance(value, str) or len(value) != 10:
        _fail("Dates must use YYYY-MM-DD")
    if value[4] != "-" or value[7] != "-":
        _fail("Dates must use YYYY-MM-DD")
    for index in (0, 1, 2, 3, 5, 6, 8, 9):
        if value[index] not in "0123456789":
            _fail("Dates must use YYYY-MM-DD")
    year = int(value[0:4])
    month = int(value[5:7])
    day = int(value[8:10])
    if year < 2000 or year > 2100:
        _fail("Date year must be between 2000 and 2100")
    if month < 1 or month > 12:
        _fail("Invalid calendar date")
    if day < 1 or day > _days_in_month(year, month):
        _fail("Invalid calendar date")
    return year, month, day


def _date_ordinal(date_parts: tuple) -> int:
    year, month, day = date_parts
    years = year - 1
    ordinal = years * 365 + years // 4 - years // 100 + years // 400
    for current_month in range(1, month):
        ordinal += _days_in_month(year, current_month)
    return ordinal + day


def _format_date(date_parts: tuple) -> str:
    year, month, day = date_parts
    month_text = str(month) if month >= 10 else "0" + str(month)
    day_text = str(day) if day >= 10 else "0" + str(day)
    return str(year) + "-" + month_text + "-" + day_text


def _next_date(value: str) -> str:
    year, month, day = _parse_date(value)
    if day < _days_in_month(year, month):
        return _format_date((year, month, day + 1))
    if month < 12:
        return _format_date((year, month + 1, 1))
    return _format_date((year + 1, 1, 1))


def _number_characters_are_safe(value: str) -> bool:
    if not isinstance(value, str) or len(value) == 0 or len(value) > 32:
        return False
    for character in value:
        if character not in "0123456789.-+":
            return False
    return True


def _canonical_coordinate(value: str, minimum: float, maximum: float) -> str:
    if not _number_characters_are_safe(value):
        _fail("Coordinates must be plain decimal numbers")
    numeric = float(value)
    if numeric != numeric or numeric < minimum or numeric > maximum:
        _fail("Coordinates are outside the allowed bounds")
    return "{:.4f}".format(numeric)


def _trigger_details(trigger_type: str) -> tuple:
    if trigger_type == TRIGGER_HEAVY_RAIN:
        return "PRECIPITATION_MM", "precipitation_sum", 0.0, 1000.0
    if trigger_type == TRIGGER_EXTREME_HEAT:
        return "TEMPERATURE_MAX_C", "temperature_2m_max", -100.0, 100.0
    if trigger_type == TRIGGER_SEVERE_STORM:
        return "WIND_MAX_KMH", "wind_speed_10m_max", 0.0, 500.0
    _fail("Unsupported trigger type")


def _canonical_threshold(trigger_type: str, value: str) -> str:
    _, _, minimum, maximum = _trigger_details(trigger_type)
    if not _number_characters_are_safe(value):
        _fail("Threshold must be a plain decimal number")
    numeric = float(value)
    if numeric != numeric or numeric < minimum or numeric > maximum:
        _fail("Threshold is outside the allowed bounds")
    return "{:.3f}".format(numeric)


def _validate_location_name(value: str) -> str:
    if not isinstance(value, str):
        _fail("Location name is required")
    cleaned = value.strip()
    if len(cleaned) < 1 or len(cleaned) > 64:
        _fail("Location name must be 1-64 characters")
    if "\n" in cleaned or "\r" in cleaned:
        _fail("Location name contains invalid characters")
    return cleaned


def _build_evidence_url(
    latitude: str, longitude: str, start_date: str, end_date: str
) -> str:
    return (
        SOURCE_BASE_URL
        + "?latitude="
        + latitude
        + "&longitude="
        + longitude
        + "&start_date="
        + start_date
        + "&end_date="
        + end_date
        + "&daily=precipitation_sum%2Ctemperature_2m_max%2Cwind_speed_10m_max"
        + "&timezone=UTC"
    )


def _error_evidence(url: str, error_code: str, status_code: int) -> str:
    return json.dumps(
        {
            "provider": SOURCE_NAME,
            "url": url,
            "status_code": status_code,
            "error_code": error_code,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def _decision_payload(
    decision: str,
    observed_value: str,
    evidence: str,
    resolution_code: str,
) -> str:
    return json.dumps(
        {
            "decision": decision,
            "observed_value": observed_value,
            "evidence": evidence,
            "resolution_code": resolution_code,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


class NimbusPact(gl.Contract):
    policies: TreeMap[str, Policy]
    policy_ids: DynArray[str]
    next_policy_number: u256

    def __init__(self):
        self.next_policy_number = u256(1)

    def _resolve_from_source(self, policy: Policy) -> dict:
        latitude = policy.latitude
        longitude = policy.longitude
        start_date = policy.start_date
        end_date = policy.end_date
        trigger_type = policy.trigger_type
        threshold = policy.threshold
        evidence_url = policy.evidence_url
        metric, metric_key, minimum, maximum = _trigger_details(trigger_type)
        threshold_value = float(threshold)

        def inspect_source() -> str:
            try:
                response = gl.nondet.web.request(evidence_url, method="GET")
            except Exception:
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "REQUEST_FAILED", 0),
                    "REQUEST_FAILED",
                )

            status_code = response.status
            if status_code != 200:
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "HTTP_STATUS", status_code),
                    "HTTP_STATUS",
                )

            try:
                body = response.body.decode("utf-8")
            except Exception:
                body = response.body
            if not isinstance(body, str):
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "BODY_NOT_TEXT", 200),
                    "BODY_NOT_TEXT",
                )

            try:
                payload = json.loads(body)
            except Exception:
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "INVALID_JSON", 200),
                    "INVALID_JSON",
                )

            if not isinstance(payload, dict):
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "INVALID_SHAPE", 200),
                    "INVALID_SHAPE",
                )

            source_latitude = payload.get("latitude")
            source_longitude = payload.get("longitude")
            daily = payload.get("daily")
            if (
                not isinstance(source_latitude, (int, float))
                or isinstance(source_latitude, bool)
                or not isinstance(source_longitude, (int, float))
                or isinstance(source_longitude, bool)
                or not isinstance(daily, dict)
            ):
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "REQUIRED_FIELDS", 200),
                    "REQUIRED_FIELDS",
                )
            if (
                source_latitude != source_latitude
                or source_longitude != source_longitude
                or abs(source_latitude - float(latitude)) > 0.5
                or abs(source_longitude - float(longitude)) > 0.5
            ):
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "LOCATION_MISMATCH", 200),
                    "LOCATION_MISMATCH",
                )

            times = daily.get("time")
            values = daily.get(metric_key)
            if not isinstance(times, list) or not isinstance(values, list):
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "REQUIRED_DAILY_FIELDS", 200),
                    "REQUIRED_DAILY_FIELDS",
                )

            expected_days = 1
            current_day = start_date
            while current_day != end_date:
                current_day = _next_date(current_day)
                expected_days += 1
            if len(times) != expected_days or len(values) != expected_days:
                return _decision_payload(
                    STATUS_DATA_UNAVAILABLE,
                    "",
                    _error_evidence(evidence_url, "DATE_SHAPE", 200),
                    "DATE_SHAPE",
                )

            normalized_values = []
            maximum_value = minimum
            current_day = start_date
            for _ in range(expected_days):
                index = -1
                for candidate_index in range(len(times)):
                    if times[candidate_index] == current_day:
                        index = candidate_index
                if index < 0:
                    return _decision_payload(
                        STATUS_DATA_UNAVAILABLE,
                        "",
                        _error_evidence(evidence_url, "DATE_MISMATCH", 200),
                        "DATE_MISMATCH",
                    )
                value = values[index]
                if (
                    not isinstance(value, (int, float))
                    or isinstance(value, bool)
                    or value != value
                    or value < minimum
                    or value > maximum
                ):
                    return _decision_payload(
                        STATUS_DATA_UNAVAILABLE,
                        "",
                        _error_evidence(evidence_url, "VALUE_OUT_OF_BOUNDS", 200),
                        "VALUE_OUT_OF_BOUNDS",
                    )
                numeric_value = float(value)
                if numeric_value > maximum_value:
                    maximum_value = numeric_value
                normalized_values.append(
                    {
                        "date": current_day,
                        "value": "{:.3f}".format(numeric_value),
                    }
                )
                current_day = _next_date(current_day)

            normalized_evidence = json.dumps(
                {
                    "provider": SOURCE_NAME,
                    "url": evidence_url,
                    "latitude": latitude,
                    "longitude": longitude,
                    "start_date": start_date,
                    "end_date": end_date,
                    "metric": metric,
                    "values": normalized_values,
                },
                sort_keys=True,
                separators=(",", ":"),
            )
            decision = (
                STATUS_TRIGGERED
                if maximum_value >= threshold_value
                else STATUS_NOT_TRIGGERED
            )
            return _decision_payload(
                decision,
                "{:.3f}".format(maximum_value),
                normalized_evidence,
                "NONE",
            )

        consensus_payload = gl.eq_principle.strict_eq(inspect_source)
        try:
            result = json.loads(consensus_payload)
        except Exception:
            _fail("Consensus returned an invalid weather decision")
        if not isinstance(result, dict):
            _fail("Consensus returned an invalid weather decision")
        if result.get("decision") not in (
            STATUS_TRIGGERED,
            STATUS_NOT_TRIGGERED,
            STATUS_DATA_UNAVAILABLE,
        ):
            _fail("Consensus returned an invalid weather decision")
        if not isinstance(result.get("evidence"), str) or len(result["evidence"]) > 24000:
            _fail("Consensus returned invalid evidence")
        if not isinstance(result.get("resolution_code"), str):
            _fail("Consensus returned invalid resolution code")
        return result

    @gl.public.write.payable
    def create_policy(
        self,
        location_name: str,
        latitude: str,
        longitude: str,
        start_date: str,
        end_date: str,
        trigger_type: str,
        threshold: str,
        beneficiary: str,
        payout_amount: u256,
    ) -> str:
        cleaned_location = _validate_location_name(location_name)
        canonical_latitude = _canonical_coordinate(latitude, -90.0, 90.0)
        canonical_longitude = _canonical_coordinate(longitude, -180.0, 180.0)
        start_parts = _parse_date(start_date)
        end_parts = _parse_date(end_date)
        start_ordinal = _date_ordinal(start_parts)
        end_ordinal = _date_ordinal(end_parts)
        if end_ordinal < start_ordinal:
            _fail("Observation end date must not precede start date")
        if end_ordinal - start_ordinal + 1 > MAX_WINDOW_DAYS:
            _fail("Observation window cannot exceed 31 days")
        if trigger_type not in ALLOWED_TRIGGERS:
            _fail("Unsupported trigger type")
        canonical_threshold = _canonical_threshold(trigger_type, threshold)
        try:
            beneficiary_address = Address(beneficiary)
        except Exception:
            _fail("Beneficiary must be a valid address")
        if payout_amount <= u256(0):
            _fail("Payout amount must be greater than zero")
        if gl.message.value != payout_amount:
            _fail("Funding must exactly equal the payout amount")

        policy_id = "p-" + str(self.next_policy_number)
        evidence_url = _build_evidence_url(
            canonical_latitude,
            canonical_longitude,
            _format_date(start_parts),
            _format_date(end_parts),
        )
        creator = gl.message.sender_address.as_hex
        policy = Policy(
            policy_id=policy_id,
            creator=creator,
            beneficiary=beneficiary_address.as_hex,
            location_name=cleaned_location,
            latitude=canonical_latitude,
            longitude=canonical_longitude,
            start_date=_format_date(start_parts),
            end_date=_format_date(end_parts),
            trigger_type=trigger_type,
            metric=_trigger_details(trigger_type)[0],
            threshold=canonical_threshold,
            payout_amount=payout_amount,
            status=STATUS_ACTIVE,
            evidence_url=evidence_url,
            evidence_digest="",
            resolution_result="",
            observed_value="",
            resolution_code="",
            withdrawn=False,
        )
        self.policies[policy_id] = policy
        self.policy_ids.append(policy_id)
        self.next_policy_number += u256(1)
        return policy_id

    @gl.public.write
    def resolve_policy(self, policy_id: str) -> None:
        if policy_id not in self.policies:
            _fail("Policy not found")
        policy = self.policies[policy_id]
        if policy.status != STATUS_ACTIVE:
            _fail("Policy has already been resolved")
        result = self._resolve_from_source(policy)
        policy.status = result["decision"]
        policy.resolution_result = result["decision"]
        policy.observed_value = result.get("observed_value", "")
        policy.resolution_code = result.get("resolution_code", "")
        policy.evidence_digest = hashlib.sha256(
            result["evidence"].encode("utf-8")
        ).hexdigest()

    @gl.public.write
    def claim_payout(self, policy_id: str) -> None:
        if policy_id not in self.policies:
            _fail("Policy not found")
        policy = self.policies[policy_id]
        if policy.withdrawn or policy.status == STATUS_CLAIMED:
            _fail("Payout already claimed")
        if policy.status != STATUS_TRIGGERED:
            _fail("Policy is not payout eligible")
        if gl.message.sender_address.as_hex != policy.beneficiary:
            _fail("Only the beneficiary can claim this payout")
        if self.balance < policy.payout_amount:
            _fail("Insufficient contract balance for payout")

        # External EOA messages are finalized-only. GenLayer currently exposes
        # no contract-side child receipt/callback that can reconcile a later
        # child failure, so the solvency check is deliberately before emission.
        NativeRecipient(Address(policy.beneficiary)).emit_transfer(
            value=policy.payout_amount,
            on="finalized",
        )
        policy.withdrawn = True
        policy.status = STATUS_CLAIMED

    @gl.public.view
    def get_policy(self, policy_id: str) -> Policy:
        if policy_id not in self.policies:
            _fail("Policy not found")
        return self.policies[policy_id]

    @gl.public.view
    def get_policies(self) -> dict:
        return {policy_id: policy for policy_id, policy in self.policies.items()}

    @gl.public.view
    def get_policy_ids(self) -> list:
        return [policy_id for policy_id in self.policy_ids]

    @gl.public.view
    def get_policy_count(self) -> u256:
        return u256(len(self.policy_ids))
