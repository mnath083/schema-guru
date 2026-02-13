from __future__ import annotations

from typing import Any


PRIMITIVES = {
    "null",
    "boolean",
    "int",
    "long",
    "float",
    "double",
    "bytes",
    "string",
}

# Avro writer->reader promotion matrix.
PROMOTIONS: dict[str, set[str]] = {
    "int": {"long", "float", "double"},
    "long": {"float", "double"},
    "float": {"double"},
    "string": {"bytes"},
    "bytes": {"string"},
}

VALID_MODES = {"backward", "forward", "full"}


def is_primitive(type_name: str) -> bool:
    return type_name in PRIMITIVES


def primitive_compatible(writer_type: str, reader_type: str) -> bool:
    return writer_type == reader_type or reader_type in PROMOTIONS.get(writer_type, set())


def normalize_mode(mode: str) -> str:
    cleaned = mode.strip().lower()
    if cleaned not in VALID_MODES:
        raise ValueError("mode must be one of: backward, forward, full")
    return cleaned


def type_label(node: Any) -> str:
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "union"
    if isinstance(node, dict):
        node_type = node.get("type")
        if isinstance(node_type, list):
            return "union"
        if isinstance(node_type, str):
            return node_type
    return "unknown"


def logical_type(node: Any) -> str | None:
    if isinstance(node, dict):
        value = node.get("logicalType")
        if isinstance(value, str):
            return value
    return None

