from __future__ import annotations

import unittest

from baron_kline import canonical_scene_bytes, hash_canonical_scene

from helpers import load_fixture


class CanonicalJsonTests(unittest.TestCase):
    def test_matches_typescript_reference_hash(self) -> None:
        scene = load_fixture("minimal-valid.json")
        self.assertEqual(
            hash_canonical_scene(scene),
            "b8a7b7f1dcfea25cc599a5c6603cd7e6101530ba5af567cabc7f1ed72cbe577d",
        )

    def test_ignores_input_property_order(self) -> None:
        first = load_fixture("minimal-valid.json")
        second = {key: first[key] for key in reversed(first)}
        self.assertEqual(canonical_scene_bytes(first), canonical_scene_bytes(second))


if __name__ == "__main__":
    unittest.main()
