from __future__ import annotations

import asyncio
from io import BytesIO

from starlette.datastructures import UploadFile

from schemaguard.schema_loader import MAX_SCHEMA_BYTES, load_schema_upload


def _upload_file(content: bytes, filename: str = "schema.json") -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(content))


def test_load_schema_upload_rejects_oversized_file() -> None:
    oversized_payload = b"{" + (b" " * MAX_SCHEMA_BYTES) + b"}"
    schema, errors = asyncio.run(load_schema_upload(_upload_file(oversized_payload), "OldSchema"))

    assert schema is None
    assert len(errors) == 1
    assert errors[0].issueType == "FILE_TOO_LARGE"


def test_load_schema_upload_accepts_valid_small_json() -> None:
    schema, errors = asyncio.run(load_schema_upload(_upload_file(b'{"type":"string"}'), "OldSchema"))

    assert errors == []
    assert schema == {"type": "string"}
