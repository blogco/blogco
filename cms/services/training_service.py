from __future__ import annotations

import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from cms.config import ROOT

BRAND_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
SAMPLE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$")
TRAINING_DIR = ROOT / "data" / "ocr-training"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temp_path = Path(temporary.name)
    temp_path.replace(path)


def _read_json(path: Path, default):
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return default


def _relative(path: Path) -> str:
    resolved = path.resolve()
    if TRAINING_DIR.resolve() not in resolved.parents and resolved != TRAINING_DIR.resolve():
        raise ValueError("Đường dẫn training không hợp lệ.")
    return resolved.relative_to(ROOT).as_posix()


def _git(*args: str, check: bool = True):
    import subprocess

    env = os.environ.copy()
    env.pop("CMS_ACCESS_HASH", None)
    env.pop("CMS_SECRET_KEY", None)
    env["GIT_TERMINAL_PROMPT"] = "0"
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, timeout=90, env=env)
    if check and result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip() or f"git {args[0]} failed")
    return result


def save_training_sample(brand: str, sample: dict, patterns: dict, message: str = "") -> dict:
    """Ghi một mẫu ground truth + patterns vào data/ocr-training/<brand>/ rồi push."""
    if not BRAND_PATTERN.fullmatch(brand or ""):
        raise ValueError("Tên thương hiệu không hợp lệ (chỉ a-z, 0-9 và dấu gạch nối).")
    sample_id = str((sample or {}).get("id", "")).strip()
    if not SAMPLE_ID_PATTERN.fullmatch(sample_id):
        raise ValueError("Mã mẫu không hợp lệ.")
    if not isinstance(patterns, dict) or not patterns:
        raise ValueError("Thiếu dữ liệu patterns đã học.")

    brand_dir = TRAINING_DIR / brand
    sample_path = brand_dir / "samples" / f"{sample_id}.json"
    patterns_path = brand_dir / "patterns.json"
    accuracy_path = brand_dir / "accuracy.json"
    index_path = TRAINING_DIR / "index.json"

    # Chuẩn hoá sample và patterns trước khi ghi.
    sample = {**sample, "brand": brand}
    patterns = {**patterns, "brand": brand, "updatedAt": patterns.get("updatedAt") or _now()}

    accuracy_log = _read_json(accuracy_path, {"brand": brand, "log": []})
    entry = {"at": _now(), "samples": int(patterns.get("sampleCount", 0)), "accuracy": float(patterns.get("accuracy", 0.45))}
    accuracy_log.setdefault("log", []).append(entry)

    index = _read_json(index_path, {"updatedAt": _now(), "repo": "blogco/blogco", "branch": "main", "brands": {}})
    index.setdefault("brands", {})[brand] = {
        "samples": int(patterns.get("sampleCount", 0)),
        "accuracy": float(patterns.get("accuracy", 0.45)),
        "version": int(patterns.get("version", 1)),
    }
    index["updatedAt"] = _now()

    _write_json(sample_path, sample)
    _write_json(patterns_path, patterns)
    _write_json(accuracy_path, accuracy_log)
    _write_json(index_path, index)

    paths = [_relative(sample_path), _relative(patterns_path), _relative(accuracy_path), _relative(index_path)]
    commit_message = (message or f"ai(training): thêm mẫu {brand}/{sample_id}").strip()

    branch = _git("branch", "--show-current").stdout.strip()
    if branch != "main":
        raise RuntimeError(f"CMS chỉ publish từ branch main; branch hiện tại là {branch or '(trống)'}.")
    if _git("diff", "--cached", "--quiet", check=False).returncode != 0:
        raise RuntimeError("Có thay đổi đã stage sẵn. Hãy xử lý chúng trước.")

    _git("add", "--", *paths)
    staged = sorted(filter(None, _git("diff", "--cached", "--name-only").stdout.splitlines()))
    if staged != sorted(paths):
        raise RuntimeError("Danh sách file đã stage không khớp dữ liệu training; dừng trước commit.")
    _git("commit", "-m", commit_message)
    commit = _git("rev-parse", "--short", "HEAD").stdout.strip()
    _git("push", "origin", "main")
    return {"commit": commit, "branch": branch, "files": paths, "remote": _git("remote", "get-url", "origin").stdout.strip()}
