# SchemaGuard Code Documentation

This document explains how the current SchemaGuard codebase works end-to-end, with module-level details and extension guidance.

## 1) High-Level Architecture

SchemaGuard is a FastAPI web app that compares two Avro schemas and returns a strict compatibility report.

- Backend framework: FastAPI
- Frontend: server-rendered HTML + vanilla JS/CSS
- Core engine: recursive Avro compatibility evaluator
- Storage: none (stateless request/response)

Main request flow:

1. User opens `/` and uploads old/new schema files.
2. Browser sends multipart form-data to `POST /compare`.
3. Backend:
   - validates mode (`backward|forward|full`)
   - reads files with hard size limit
   - parses JSON
   - validates Avro schema shape (`fastavro.parse_schema` when available)
   - runs compatibility checks
4. API returns normalized JSON report:
   - compatible result: `{ "compatible": true }`
   - incompatible result: `{ "compatible": false, "totalErrors": N, "errors": [...] }`
5. Frontend renders badges, issue cards, and optional raw JSON.

## 2) Entry Points

### `/Users/manjunath/Desktop/Schema Guru/run.py`

Development launcher using `uvicorn.run("schemaguard.main:app", ...)`.

- Defaults: `--host 127.0.0.1`, `--port 8000`
- `--reload` enables auto-reload for development.

### `/Users/manjunath/Desktop/Schema Guru/schemaguard/main.py`

Creates the FastAPI app and routes:

- `GET /`: serves `templates/index.html`
- `POST /compare`: main API endpoint

Key responsibilities in `POST /compare`:

1. Normalize and validate mode via `normalize_mode`.
2. Load old schema with `load_schema_upload`.
3. Load new schema with `load_schema_upload`.
4. Validate both schemas with `validate_avro_schema`.
5. Run compatibility logic through `check_compatibility`.
6. Return JSON built by `build_report`.

HTTP status behavior:

- `200`: successful compatibility evaluation (compatible or incompatible)
- `400`: invalid mode/schema/upload parsing/validation errors
- `413`: file too large (`FILE_TOO_LARGE`)

## 3) Input Loading and Validation

### `/Users/manjunath/Desktop/Schema Guru/schemaguard/schema_loader.py`

Purpose: make uploads safe and parseable before compatibility logic runs.

Core pieces:

- `MAX_SCHEMA_BYTES = 1 MiB` hard limit per file.
- `_read_upload_with_limit(...)` reads in chunks (`64 KiB`) and stops if limit exceeded.
- `parse_json_bytes(...)`:
  - enforces UTF-8
  - parses JSON and returns detailed JSON parse location on failure.
- `load_schema_upload(...)`:
  - wraps upload read + parse logic
  - converts failures into `CompatibilityIssue` objects.
- `validate_avro_schema(...)`:
  - uses `fastavro.parse_schema` when installed
  - fallback minimal type validation when `fastavro` unavailable.

Why this matters:

- Prevents memory abuse from oversized uploads.
- Produces consistent error format even for input-layer failures.

## 4) Compatibility Engine (Core Logic)

### `/Users/manjunath/Desktop/Schema Guru/schemaguard/compatibility_engine.py`

This is the main recursive evaluator. It compares writer schema vs reader schema according to Avro compatibility rules.

### `SchemaRegistry`

Tracks named types (`record`, `enum`, `fixed`) and resolves references/aliases.

- `named_types`: full-name -> schema node
- `alias_to_fullname`: alias -> full-name
- `node_name_info`: node id -> `NameInfo(fullname, namespace, aliases)`

Why it exists:

- Avro schemas frequently reference named types by string.
- Correct comparison requires namespace + alias-aware resolution.

### `CompatibilityEngine`

Constructed with:

- `writer_schema`
- `reader_schema`
- `direction` (`backward` or `forward`)

`run()` computes a root path (`record name` or `"RootSchema"`) and recursively compares nodes.

Important comparison stages in `_compare(...)`:

1. Union detection and handling (`_compare_union`)
2. Named/reference resolution via both registries
3. Logical type comparison (must match)
4. Primitive compatibility/promotion check
5. Complex-type branching:
   - `record` -> `_compare_record`
   - `array` -> compare `items`
   - `map` -> compare `values`
   - `enum` -> `_compare_enum`
   - `fixed` -> size equality check

If unsupported or unresolved, engine emits structured issues.

### Direction handling

`check_compatibility(old_schema, new_schema, mode)`:

- `backward`: compare old(writer) -> new(reader)
- `forward`: compare new(writer) -> old(reader)
- `full`: run both and merge errors

## 5) Rule Helpers

### `/Users/manjunath/Desktop/Schema Guru/schemaguard/rules.py`

Contains shared rule helpers:

- Primitive set and promotions matrix
- `primitive_compatible(writer, reader)`
- `normalize_mode(mode)`
- `type_label(node)` for readable issue typing
- `logical_type(node)` extraction

Promotion matrix currently includes:

- `int -> long|float|double`
- `long -> float|double`
- `float -> double`
- `string <-> bytes`

## 6) Report Model

### `/Users/manjunath/Desktop/Schema Guru/schemaguard/reporter.py`

Defines normalized error payload shape:

- `CompatibilityIssue` dataclass:
  - `path`
  - `issueType`
  - `writerType`
  - `readerType`
  - `description`

`build_report(errors)` returns:

- no errors: `{ "compatible": true }`
- with errors:
  - `compatible: false`
  - `totalErrors`
  - `errors: [CompatibilityIssue as dict]`

## 7) Frontend Rendering

### `/Users/manjunath/Desktop/Schema Guru/schemaguard/templates/index.html`

Contains upload form and result section:

- file inputs: `old_schema_file`, `new_schema_file`
- mode select: `backward|forward|full`
- result panel + raw JSON toggle

### `/Users/manjunath/Desktop/Schema Guru/schemaguard/static/app.js`

Client behavior:

1. On submit, sends `FormData` to `/compare`.
2. Renders compatible/incompatible summary.
3. Expands first two error cards by default.
4. Shows/hides raw JSON response.
5. Handles network failure by injecting `REQUEST_FAILED` pseudo-error.

### `/Users/manjunath/Desktop/Schema Guru/schemaguard/static/styles.css`

Defines UI layout, badges, cards, and raw JSON block styling.

## 8) Error Types You’ll See

Common `issueType` values emitted by code:

- `INVALID_MODE`
- `INVALID_UPLOAD`
- `FILE_TOO_LARGE`
- `INVALID_SCHEMA_JSON`
- `INVALID_AVRO_SCHEMA`
- `UNKNOWN_WRITER_TYPE`
- `UNKNOWN_READER_TYPE`
- `LOGICAL_TYPE_CHANGED`
- `TYPE_MISMATCH`
- `MISSING_DEFAULT`
- `REMOVED_FIELD`
- `ENUM_SYMBOL_REMOVED`
- `UNION_MISMATCH`
- `UNSUPPORTED_TYPE`
- `REQUEST_FAILED` (frontend-side only, network failure fallback)

## 9) Tests

### `/Users/manjunath/Desktop/Schema Guru/tests/test_compatibility_rules.py`

Current test coverage validates:

- primitive mismatch
- union mismatch
- nested record mismatch
- added field without default (`MISSING_DEFAULT`)
- enum symbol removal
- logical type change
- forward-mode removed field (`REMOVED_FIELD`)

Run with:

```bash
pytest -q
```

## 10) How to Extend Safely

When adding rules/features, follow this order:

1. Add failing tests in `/Users/manjunath/Desktop/Schema Guru/tests/test_compatibility_rules.py`.
2. Implement logic in `compatibility_engine.py` (or `rules.py` if helper-level).
3. Keep all failures represented as `CompatibilityIssue`.
4. Preserve stable response shape from `build_report`.
5. If introducing new issue types, update frontend rendering text if needed.

Good extension points:

- Add more Avro-specific compatibility rules (e.g., record field aliases handling in field mapping).
- Add severity/category metadata in `CompatibilityIssue`.
- Add API authentication and persistence for SaaS evolution.
