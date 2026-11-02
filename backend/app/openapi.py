"""Writes the API description to openapi.json, for the frontend's generated types.

    python -m app.openapi            (then, in frontend/: npm run api:types:file)
"""

import json
from pathlib import Path

from app.main import app

if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "openapi.json"
    out.write_text(json.dumps(app.openapi(), indent=1), encoding="utf-8")
    print(f"Wrote {out}")
