from __future__ import annotations

from schemaguard.compatibility_engine import check_compatibility
from schemaguard.reporter import build_report


def _record(fields: list[dict]) -> dict:
    return {"type": "record", "name": "User", "fields": fields}


def _find_issue(errors: list[dict], issue_type: str) -> dict:
    for err in errors:
        if err["issueType"] == issue_type:
            return err
    raise AssertionError(f"Expected issueType={issue_type} in errors={errors!r}")


def test_primitive_type_change_is_incompatible() -> None:
    old_schema = _record([{"name": "id", "type": "int"}])
    new_schema = _record([{"name": "id", "type": "string"}])

    report = build_report(check_compatibility(old_schema, new_schema, "backward"))

    assert report["compatible"] is False
    err = _find_issue(report["errors"], "TYPE_MISMATCH")
    assert err["path"] == "User.id"
    assert err["writerType"] == "int"
    assert err["readerType"] == "string"


def test_union_mismatch_detected() -> None:
    old_schema = _record([{"name": "payload", "type": ["null", "string"], "default": None}])
    new_schema = _record([{"name": "payload", "type": ["null", "int"], "default": None}])

    report = build_report(check_compatibility(old_schema, new_schema, "backward"))

    assert report["compatible"] is False
    err = _find_issue(report["errors"], "UNION_MISMATCH")
    assert err["path"].startswith("User.payload")


def test_nested_record_failure_detected() -> None:
    old_schema = {
        "type": "record",
        "name": "ParentRecord",
        "fields": [
            {
                "name": "child",
                "type": {
                    "type": "record",
                    "name": "ChildRecord",
                    "fields": [{"name": "code", "type": "int"}],
                },
            }
        ],
    }
    new_schema = {
        "type": "record",
        "name": "ParentRecord",
        "fields": [
            {
                "name": "child",
                "type": {
                    "type": "record",
                    "name": "ChildRecord",
                    "fields": [{"name": "code", "type": "string"}],
                },
            }
        ],
    }

    report = build_report(check_compatibility(old_schema, new_schema, "backward"))

    assert report["compatible"] is False
    err = _find_issue(report["errors"], "TYPE_MISMATCH")
    assert err["path"] == "ParentRecord.child.code"


def test_missing_default_for_added_field_is_incompatible() -> None:
    old_schema = _record([{"name": "id", "type": "long"}])
    new_schema = _record([{"name": "id", "type": "long"}, {"name": "email", "type": "string"}])

    report = build_report(check_compatibility(old_schema, new_schema, "backward"))

    assert report["compatible"] is False
    err = _find_issue(report["errors"], "MISSING_DEFAULT")
    assert err["path"] == "User.email"


def test_enum_symbol_removal_detected() -> None:
    old_schema = _record(
        [
            {
                "name": "status",
                "type": {
                    "type": "enum",
                    "name": "Status",
                    "symbols": ["ACTIVE", "INACTIVE"],
                },
            }
        ]
    )
    new_schema = _record(
        [
            {
                "name": "status",
                "type": {
                    "type": "enum",
                    "name": "Status",
                    "symbols": ["ACTIVE"],
                },
            }
        ]
    )

    report = build_report(check_compatibility(old_schema, new_schema, "backward"))

    assert report["compatible"] is False
    err = _find_issue(report["errors"], "ENUM_SYMBOL_REMOVED")
    assert err["path"] == "User.status"


def test_logical_type_change_detected() -> None:
    old_schema = _record(
        [{"name": "createdAt", "type": {"type": "long", "logicalType": "timestamp-millis"}}]
    )
    new_schema = _record(
        [{"name": "createdAt", "type": {"type": "long", "logicalType": "timestamp-micros"}}]
    )

    report = build_report(check_compatibility(old_schema, new_schema, "backward"))

    assert report["compatible"] is False
    err = _find_issue(report["errors"], "LOGICAL_TYPE_CHANGED")
    assert err["path"] == "User.createdAt"


def test_removed_field_in_forward_mode_detected() -> None:
    old_schema = _record([{"name": "id", "type": "long"}, {"name": "email", "type": "string"}])
    new_schema = _record([{"name": "id", "type": "long"}])

    report = build_report(check_compatibility(old_schema, new_schema, "forward"))

    assert report["compatible"] is False
    err = _find_issue(report["errors"], "REMOVED_FIELD")
    assert err["path"] == "User.email"

