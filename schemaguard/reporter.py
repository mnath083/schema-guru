from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class CompatibilityIssue:
    path: str
    issueType: str
    writerType: str
    readerType: str
    description: str


def issue(
    *,
    path: str,
    issue_type: str,
    writer_type: str,
    reader_type: str,
    description: str,
) -> CompatibilityIssue:
    return CompatibilityIssue(
        path=path,
        issueType=issue_type,
        writerType=writer_type,
        readerType=reader_type,
        description=description,
    )


def build_report(errors: list[CompatibilityIssue]) -> dict:
    if not errors:
        return {"compatible": True}
    return {
        "compatible": False,
        "totalErrors": len(errors),
        "errors": [asdict(e) for e in errors],
    }

