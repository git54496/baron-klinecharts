from __future__ import annotations

import hashlib
import unittest
from pathlib import Path

from baron_kline import runtime_template_bytes

from helpers import REPOSITORY


class RuntimeSyncTests(unittest.TestCase):
    def test_python_bundles_exact_node_runtime_template(self) -> None:
        node_template = (
            REPOSITORY
            / "packages"
            / "render-runtime"
            / "generated"
            / "runtime-template.html"
        ).read_bytes()
        self.assertEqual(
            hashlib.sha256(runtime_template_bytes()).digest(),
            hashlib.sha256(node_template).digest(),
        )
        self.assertEqual(runtime_template_bytes(), node_template)


if __name__ == "__main__":
    unittest.main()
