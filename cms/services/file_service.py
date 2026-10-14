from __future__ import annotations

import re
import secrets
import tempfile
from datetime import date
from pathlib import Path

import frontmatter

from cms.config import ROOT

ALLOWED_SECTIONS = ("posts", "kien-thuc", "suc-khoe")
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def validate_location(section: str, slug: str) -> Path:
    if section not in ALLOWED_SECTIONS:
        raise ValueError("Chuyên mục không được hỗ trợ.")
    if not SLUG_PATTERN.fullmatch(slug):
        raise ValueError("Slug chỉ gồm chữ thường không dấu, số và dấu gạch nối.")
    target = ROOT / "content" / section / f"{slug}.md"
    if target.parent.resolve() not in { (ROOT / "content" / item).resolve() for item in ALLOWED_SECTIONS }:
        raise ValueError("Đường dẫn bài viết không hợp lệ.")
    return target


def load_article(section: str, slug: str) -> dict:
    path = validate_location(section, slug)
    if not path.is_file():
        return {"section": section, "slug": slug, "title": "", "date": date.today().isoformat(),
                "category": "", "tags": "", "description": "", "image": "", "summary": "",
                "content": "", "draft": True}
    post = frontmatter.load(path)
    metadata = post.metadata
    return {
        "section": section, "slug": slug, "title": metadata.get("title", ""),
        "date": str(metadata.get("date", date.today().isoformat()))[:10],
        "category": ", ".join(metadata.get("categories", [])),
        "tags": ", ".join(metadata.get("tags", [])),
        "description": metadata.get("description", ""), "image": metadata.get("image", ""),
        "summary": metadata.get("summary", ""), "content": post.content,
        "draft": bool(metadata.get("draft", False)),
    }


def save_article(data: dict, *, draft: bool) -> Path:
    path = validate_location(data["section"], data["slug"])
    try:
        parsed_date = date.fromisoformat(data["date"])
    except (ValueError, TypeError) as error:
        raise ValueError("Ngày đăng không đúng định dạng YYYY-MM-DD.") from error
    title = data["title"].strip()
    content = data["content"].strip()
    if not title or len(title) > 180:
        raise ValueError("Tiêu đề cần có từ 1 đến 180 ký tự.")
    if not content:
        raise ValueError("Nội dung bài viết không được để trống.")

    categories = [item.strip() for item in data.get("category", "").split(",") if item.strip()]
    tags = [item.strip() for item in data.get("tags", "").split(",") if item.strip()]
    metadata = {
        "title": title, "date": parsed_date.isoformat(), "categories": categories, "tags": tags,
        "description": data.get("description", "").strip(), "image": data.get("image", "").strip(),
        "author": "BlogCo Editorial", "draft": draft,
    }
    if data.get("summary", "").strip():
        metadata["summary"] = data["summary"].strip()
    serialized = frontmatter.dumps(frontmatter.Post(content, **metadata))
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        temporary.write(serialized)
        temp_path = Path(temporary.name)
    temp_path.replace(path)
    return path


def save_uploaded_image(filename: str, content_type: str, data: bytes) -> tuple[str, Path]:
    allowed = {
        ".jpg": ("image/jpeg", lambda blob: blob.startswith(b"\xff\xd8\xff")),
        ".jpeg": ("image/jpeg", lambda blob: blob.startswith(b"\xff\xd8\xff")),
        ".png": ("image/png", lambda blob: blob.startswith(b"\x89PNG\r\n\x1a\n")),
        ".webp": ("image/webp", lambda blob: len(blob) > 12 and blob[:4] == b"RIFF" and blob[8:12] == b"WEBP"),
        ".gif": ("image/gif", lambda blob: blob.startswith((b"GIF87a", b"GIF89a"))),
    }
    suffix = Path(filename).suffix.lower()
    rule = allowed.get(suffix)
    if not rule or content_type != rule[0] or not rule[1](data):
        raise ValueError("Chỉ nhận ảnh JPEG, PNG, WebP hoặc GIF hợp lệ.")
    if not data or len(data) > 8 * 1024 * 1024:
        raise ValueError("Ảnh phải có dung lượng dưới 8 MB.")
    safe_stem = re.sub(r"[^a-z0-9-]+", "-", Path(filename).stem.lower()).strip("-")[:48] or "image"
    destination_dir = ROOT / "static" / "images"
    destination_dir.mkdir(parents=True, exist_ok=True)
    name = f"{safe_stem}-{secrets.token_hex(4)}{suffix}"
    target = destination_dir / name
    target.write_bytes(data)
    return f"/images/{name}", target
