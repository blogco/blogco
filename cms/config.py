from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def cms_secret() -> str:
    value = os.getenv("CMS_SECRET_KEY", "")
    if len(value) < 32:
        raise RuntimeError("CMS_SECRET_KEY is missing; run `python -m cms.bootstrap` first.")
    return value


def access_hash() -> str:
    value = os.getenv("CMS_ACCESS_HASH", "")
    if not value.startswith("pbkdf2_sha256$"):
        raise RuntimeError("CMS_ACCESS_HASH is missing; run `python -m cms.bootstrap` first.")
    return value
