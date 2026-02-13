from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from schemaguard.compatibility_engine import check_compatibility
from schemaguard.reporter import build_report, issue
from schemaguard.rules import normalize_mode
from schemaguard.schema_loader import load_schema_upload, validate_avro_schema


BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="SchemaGuard", version="2.0.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request=request, name="index.html", context={})


@app.post("/compare")
async def compare(
    old_schema_file: UploadFile = File(...),
    new_schema_file: UploadFile = File(...),
    mode: str = Form(...),
) -> JSONResponse:
    try:
        normalized_mode = normalize_mode(mode)
    except ValueError as exc:
        payload = build_report(
            [
                issue(
                    path="mode",
                    issue_type="INVALID_MODE",
                    writer_type=mode,
                    reader_type="backward|forward|full",
                    description=str(exc),
                )
            ]
        )
        return JSONResponse(status_code=400, content=payload)

    old_schema, old_errors = await load_schema_upload(old_schema_file, "OldSchema")
    if old_errors:
        return JSONResponse(status_code=400, content=build_report(old_errors))

    new_schema, new_errors = await load_schema_upload(new_schema_file, "NewSchema")
    if new_errors:
        return JSONResponse(status_code=400, content=build_report(new_errors))

    old_validation_errors = validate_avro_schema(old_schema, "OldSchema")
    if old_validation_errors:
        return JSONResponse(status_code=400, content=build_report(old_validation_errors))

    new_validation_errors = validate_avro_schema(new_schema, "NewSchema")
    if new_validation_errors:
        return JSONResponse(status_code=400, content=build_report(new_validation_errors))

    errors = check_compatibility(old_schema=old_schema, new_schema=new_schema, mode=normalized_mode)
    return JSONResponse(status_code=200, content=build_report(errors))

