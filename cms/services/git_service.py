from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

from cms.config import ROOT
from cms.services.file_service import validate_location

COMMIT_PATTERN = re.compile(r"^(feat|fix|style|docs|chore)\([a-z0-9-]+\): .{8,160}$")


def _git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.pop("CMS_ACCESS_HASH", None)
    env.pop("CMS_SECRET_KEY", None)
    env["GIT_TERMINAL_PROMPT"] = "0"
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, timeout=90, env=env)
    if check and result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(detail or f"git {args[0]} failed")
    return result


def publish_article(section: str, slug: str, message: str, image_url: str = "") -> dict:
    if not COMMIT_PATTERN.fullmatch(message.strip()):
        raise ValueError("Commit message cần theo dạng feat(content): mô tả cụ thể.")
    branch = _git("branch", "--show-current").stdout.strip()
    if branch != "main":
        raise RuntimeError(f"CMS chỉ publish từ branch main; branch hiện tại là {branch or '(trống)'}.")
    if _git("diff", "--cached", "--quiet", check=False).returncode != 0:
        raise RuntimeError("Có thay đổi đã stage sẵn. Hãy xử lý chúng trước để CMS không gộp nhầm vào commit.")

    article_path = validate_location(section, slug)
    if not article_path.is_file():
        raise RuntimeError("Không tìm thấy bài viết đã lưu để publish.")
    article_relative = article_path.relative_to(ROOT).as_posix()
    paths = [article_relative]
    if re.fullmatch(r"/images/[A-Za-z0-9._-]+", image_url):
        image_name = Path(image_url).name
        image_path = ROOT / "static" / "images" / image_name
        if image_name and image_path.is_file() and image_path.resolve().parent == (ROOT / "static" / "images").resolve():
            image_relative = image_path.relative_to(ROOT).as_posix()
            if _git("status", "--porcelain", "--", image_relative).stdout.strip():
                paths.append(image_relative)

    paths = [path for path in paths if _git("status", "--porcelain", "--", path).stdout.strip()]
    if not paths:
        raise RuntimeError("Bài viết không có thay đổi mới để publish.")

    _git("add", "--", *paths)
    staged = sorted(filter(None, _git("diff", "--cached", "--name-only").stdout.splitlines()))
    if staged != sorted(paths):
        raise RuntimeError("Danh sách file đã stage không khớp bài viết và ảnh của bài; dừng trước commit.")
    _git("commit", "-m", message.strip())
    commit = _git("rev-parse", "--short", "HEAD").stdout.strip()
    _git("push", "origin", "main")
    return {"commit": commit, "branch": branch, "files": paths, "remote": _git("remote", "get-url", "origin").stdout.strip()}
