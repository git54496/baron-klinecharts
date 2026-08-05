from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from baron_kline import (
    DrawingCollection,
    DrawingDocument,
    DrawingDocumentError,
    canonical_drawing_document_bytes,
    canonical_drawing_document_json,
    hash_canonical_drawing_document,
    load_drawing_document,
    normalize_decimal_value,
    save_drawing_document,
)

from helpers import FIXTURES

DRAWINGS = FIXTURES.parent / "drawings"


class DrawingDocumentContractTest(unittest.TestCase):
    def test_loads_22_type_fixture_and_round_trips(self) -> None:
        document = load_drawing_document(DRAWINGS / "all-drawings.json")
        self.assertEqual(len(document.drawings), 22)
        first = canonical_drawing_document_bytes(document)
        second = canonical_drawing_document_bytes(document.to_dict())
        self.assertEqual(first, second)
        self.assertEqual(
            hash_canonical_drawing_document(document),
            hash_canonical_drawing_document(document.to_dict()),
        )

    def test_canonical_json_sorts_keys(self) -> None:
        document = load_drawing_document(DRAWINGS / "all-drawings.json")
        value = document.to_dict()
        value["metadata"] = {"b": 1, "a": 2}
        canonical = canonical_drawing_document_json(value)
        self.assertIn('"a":2', canonical)
        self.assertIn('"b":1', canonical)

    def test_decimal_normalization_matches_type_script_rules(self) -> None:
        self.assertEqual(normalize_decimal_value(1.005, 2), 1.01)
        self.assertEqual(normalize_decimal_value(-1.005, 2), -1.01)
        self.assertEqual(normalize_decimal_value(-12.5, 0), -13)
        self.assertEqual(normalize_decimal_value(2.675, 2), 2.68)
        self.assertEqual(normalize_decimal_value(1.2345678901234567, 16), 1.2345678901234567)
        zero = normalize_decimal_value(-0.0004, 3)
        self.assertEqual(zero, 0)
        self.assertFalse(zero == 0 and __import__("math").copysign(1.0, zero) < 0)

    def test_negative_zero_is_rejected_as_un_normalized(self) -> None:
        document = load_drawing_document(DRAWINGS / "all-drawings.json")
        value = document.to_dict()
        value["drawings"][0]["geometry"]["value"] = -0.0
        with self.assertRaises(DrawingDocumentError) as context:
            DrawingDocument.from_dict(value)
        self.assertEqual(context.exception.code, "DRAWING_GEOMETRY_INVALID")
        self.assertEqual(
            context.exception.path,
            "/drawings/0/geometry/value",
        )

    def test_rejects_invalid_fixtures(self) -> None:
        cases = {
            "invalid-extra-field.json": (
                "DRAWING_DOCUMENT_SCHEMA_INVALID",
                "/drawings/0/extra",
            ),
            "invalid-duplicate-id.json": (
                "DRAWING_DUPLICATE_ID",
                "/drawings/1/id",
            ),
            "invalid-unknown-type.json": (
                "DRAWING_DOCUMENT_SCHEMA_INVALID",
                "/drawings/0/type",
            ),
            "invalid-un-normalized-value.json": (
                "DRAWING_GEOMETRY_INVALID",
                "/drawings/0/geometry/value",
            ),
            "invalid-target-missing.json": (
                "DRAWING_TARGET_INVALID",
                "/drawings/0/target",
            ),
            "invalid-value-axes-order.json": (
                "DRAWING_DOCUMENT_SEMANTIC_INVALID",
                "/coordinateSystem/valueAxes/1",
            ),
        }
        for name, (code, path) in cases.items():
            with self.subTest(name=name):
                with self.assertRaises(DrawingDocumentError) as context:
                    load_drawing_document(DRAWINGS / name)
                self.assertEqual(context.exception.code, code)
                self.assertEqual(context.exception.path, path)

    def test_collection_edits_validate_and_round_trip(self) -> None:
        document = load_drawing_document(DRAWINGS / "all-drawings.json")
        collection = DrawingCollection(document)
        target = collection.get("drawing-rayLine-9")
        collection.remove(target["id"])
        self.assertEqual(len(collection.list()), 21)
        collection.add(target)
        self.assertEqual(len(collection.list()), 22)
        changed = dict(target, zLevel=77)
        collection.replace(target["id"], changed)
        self.assertEqual(collection.get(target["id"])["zLevel"], 77)

    def test_save_requires_force_for_existing_output(self) -> None:
        document = load_drawing_document(DRAWINGS / "all-drawings.json")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "drawing.json"
            save_drawing_document(document, output)
            with self.assertRaises(FileExistsError):
                save_drawing_document(document, output)
            save_drawing_document(document, output, force=True)
            reloaded = load_drawing_document(output)
            self.assertEqual(
                canonical_drawing_document_bytes(document),
                canonical_drawing_document_bytes(reloaded),
            )

    def test_none_values_are_preserved(self) -> None:
        document = load_drawing_document(DRAWINGS / "all-drawings.json")
        value = document.to_dict()
        value["metadata"] = {"nullable": None, "keep": "value"}
        restored = DrawingDocument.from_dict(value)
        self.assertIsNone(restored.metadata["nullable"])
        self.assertEqual(restored.metadata["keep"], "value")
