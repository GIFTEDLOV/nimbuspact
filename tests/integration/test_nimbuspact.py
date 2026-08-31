"""Studio-mode smoke scaffolding for NimbusPact.

Run with: gltest tests/integration/ -v -s
"""

import pytest

from gltest import get_contract_factory


@pytest.mark.integration
def test_nimbuspact_deploys_with_empty_state():
    contract = get_contract_factory("NimbusPact").deploy()
    assert contract.get_policy_count().call() == 0
    assert contract.get_policies().call() == {}
