"""Shared helpers for NimbusPact direct-mode tests."""

import json
import os


# genlayer-test v0.29 redirects fd 0 to a temporary file before importing a
# contract. On Windows the file remains open, so its immediate unlink raises
# WinError 32 even though the direct VM is otherwise ready. Keep this narrow
# test-only compatibility shim out of the production contract and UI.
if os.name == "nt":
    _original_unlink = os.unlink

    def _unlink_after_fd_redirect(path, *args, **kwargs):
        try:
            _original_unlink(path, *args, **kwargs)
        except PermissionError as error:
            if getattr(error, "winerror", None) != 32:
                raise

    os.unlink = _unlink_after_fd_redirect


PAYOUT = 10**18
LATITUDE = 6.5244
LONGITUDE = 3.3792
START_DATE = "2024-06-20"
END_DATE = "2024-06-22"
CREATE_TIMESTAMP = "2024-06-19T23:59:59Z"
AFTER_WINDOW_TIMESTAMP = "2024-06-23T00:00:00Z"


def to_hex(address):
    if hasattr(address, "as_hex"):
        return address.as_hex
    from genlayer.py.types import Address

    return Address(address).as_hex


def weather_payload(
    precipitation=(10.0, 20.0, 30.0),
    temperature=(31.0, 32.0, 33.0),
    wind=(30.0, 40.0, 50.0),
    latitude=LATITUDE,
    longitude=LONGITUDE,
):
    return {
        "latitude": latitude,
        "longitude": longitude,
        "daily": {
            "time": [START_DATE, "2024-06-21", END_DATE],
            "precipitation_sum": list(precipitation),
            "temperature_2m_max": list(temperature),
            "wind_speed_10m_max": list(wind),
        },
    }


def mock_weather(vm, payload=None, status=200, body=None):
    vm.clear_mocks()
    if body is None:
        body = json.dumps(payload or weather_payload())
    vm.mock_web(r".*archive-api\.open-meteo\.com.*", {"status": status, "body": body})


def fund_policy(vm, contract, creator, beneficiary, **overrides):
    creation_timestamp = overrides.pop("creation_timestamp", CREATE_TIMESTAMP)
    post_create_timestamp = overrides.pop(
        "post_create_timestamp", AFTER_WINDOW_TIMESTAMP
    )
    vm.warp(creation_timestamp)
    vm.sender = creator
    vm.value = PAYOUT
    args = {
        "location_name": "Lagos Island",
        "latitude": "6.5244",
        "longitude": "3.3792",
        "start_date": START_DATE,
        "end_date": END_DATE,
        "trigger_type": "HEAVY_RAIN",
        "threshold": "50",
        "beneficiary": to_hex(beneficiary),
        "payout_amount": PAYOUT,
    }
    args.update(overrides)
    policy_id = contract.create_policy(**args)
    vm.value = 0
    if post_create_timestamp is not None:
        vm.warp(post_create_timestamp)
    return policy_id, args
