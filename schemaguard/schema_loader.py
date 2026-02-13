from __future__ import annotations

import json
from typing import Any

from fastapi import UploadFile

from schemaguard.reporter import CompatibilityIssue, issue

try:
    from fastavro import parse_schema
except Exception:  # pragma: no cover
    parse_schema = None


def parse_json_bytes(payload: bytes) -> tuple[Any | None, str | None]:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return None, "Schema file must be UTF-8 encoded."

    try:
        return json.loads(text), None
    except json.JSONDecodeError as exc:
        return None, f"Invalid JSON: {exc.msg} (line {exc.lineno}, column {exc.colno})."


async def load_schema_upload(file: UploadFile, schema_label: str) -> tuple[Any | None, list[CompatibilityIssue]]:
    try:
        payload = await file.read()
    except Exception as exc:
        return None, [
            issue(
                path=schema_label,
                issue_type="INVALID_UPLOAD",
                writer_type="file",
                reader_type="readable-file",
                description=f"Failed to read uploaded file: {exc}",
            )
        ]

    schema, parse_error = parse_json_bytes(payload)
    if parse_error:
        return None, [
            issue(
                path=schema_label,
                issue_type="INVALID_SCHEMA_JSON",
                writer_type="file",
                reader_type="valid-json",
                description=parse_error,
            )
        ]

    return schema, []


def validate_avro_schema(schema: Any, schema_label: str) -> list[CompatibilityIssue]:
    if parse_schema is not None:
        try:
            parse_schema(schema)
            return []
        except Exception as exc:
            return [
                issue(
                    path=schema_label,
                    issue_type="INVALID_AVRO_SCHEMA",
                    writer_type="unknown",
                    reader_type="valid-avro-schema",
                    description=str(exc),
                )
            ]

    # Minimal fallback validation when fastavro is unavailable.
    if not isinstance(schema, (dict, list)):
        return [
            issue(
                path=schema_label,
                issue_type="INVALID_AVRO_SCHEMA",
                writer_type=type(schema).__name__,
                reader_type="object-or-union",
                description="Top-level Avro schema must be an object or union array.",
            )
        ]
    return []

