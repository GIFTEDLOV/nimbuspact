# NimbusPact integration tests

These tests use the repository's `gltest` Studio-mode convention and are intentionally separate from the fast direct suite.

Run them only with a running local GenLayer Studio or an explicitly configured hosted network:

```shell
gltest tests/integration/ -v -s
```

The smoke test deploys `contracts/nimbuspact.py` and verifies its initial state. Full consensus runs should be added against a controlled weather fixture or validator mock before deployment preflight; the direct suite covers the source-validation matrix without depending on live weather.
