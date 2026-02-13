# SchemaGuard

SchemaGuard is a web application that compares two Avro schema JSON files and reports strict compatibility errors.

## Stack

- Python 3.10+
- FastAPI
- Jinja2 templates
- Vanilla JS/CSS frontend
- No database

## Project Structure

```text
schemaguard/
  __init__.py
  main.py
  schema_loader.py
  compatibility_engine.py
  rules.py
  reporter.py
  templates/
    index.html
  static/
    app.js
    styles.css
tests/
  conftest.py
  test_compatibility_rules.py
run.py
requirements.txt
```

## Setup

```bash
python3 -m pip install -r requirements.txt
python3 run.py --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## API

### `POST /compare`

Form fields:

- `old_schema_file`: old Avro schema JSON file
- `new_schema_file`: new Avro schema JSON file
- `mode`: `backward`, `forward`, `full`

Notes:

- Uploaded schema size is capped at `1 MiB` per file.
- Oversized files return HTTP `413` with `FILE_TOO_LARGE`.

Compatible response:

```json
{
  "compatible": true
}
```

Incompatible response:

```json
{
  "compatible": false,
  "totalErrors": 2,
  "errors": [
    {
      "path": "ParentRecord.fieldName.nestedField",
      "issueType": "TYPE_MISMATCH",
      "writerType": "int",
      "readerType": "string",
      "description": "Primitive type promotion is not allowed by Avro for this direction."
    }
  ]
}
```

## Compatibility Rules Implemented

- Primitive compatibility with Avro promotions (`int -> long/float/double`, etc.)
- Union branch resolution and mismatch detection
- Added mandatory fields (no default) are incompatible in backward checks
- Removed fields without default are incompatible in forward checks
- Recursive checks for nested records, arrays, and maps
- Enum symbol removal detection
- Logical type change detection
- Named type resolution with namespace and alias handling

## Running Tests

```bash
pytest -q
```
