"""Xuất giáo án HTML → PDF bằng Playwright (tuỳ chọn, chất lượng cao).

Tính năng "Soạn giáo án" trên web tự xuất PDF phía trình duyệt bằng html2pdf.js,
nên module này là tuỳ chọn: chỉ dùng khi bạn muốn render server-side (chữ nét hơn,
đúng khổ A4 landscape, không phụ thuộc CDN).

Cài đặt (không bắt buộc cho web chính)::

    .venv-cms/bin/pip install playwright
    .venv-cms/bin/python -m playwright install chromium

Ví dụ::

    from pathlib import Path
    from cms.services.pdf_service import export_file_to_pdf

    export_file_to_pdf(Path("giao-an.html"), Path("giao-an.pdf"))
"""

from __future__ import annotations

import asyncio
from pathlib import Path


def _require_playwright():
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:  # pragma: no cover - phụ thuộc môi trường
        raise RuntimeError(
            "Cần cài Playwright để xuất PDF phía server: "
            "`pip install playwright && python -m playwright install chromium`."
        ) from exc
    return async_playwright


async def export_html_to_pdf(
    html: str,
    pdf_path: Path,
    *,
    landscape: bool = True,
    base_url: str | None = None,
) -> Path:
    """Render một chuỗi HTML (đã gồm các ``.pdf-slide``) thành file PDF.

    ``base_url`` cho phép tài nguyên tương đối (CSS, ảnh) tải được; nếu bỏ trống,
    HTML được nạp trực tiếp qua ``page.set_content``.
    """
    async_playwright = _require_playwright()
    pdf_path = Path(pdf_path)
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            page = await browser.new_page()
            if base_url:
                await page.goto(base_url, wait_until="networkidle")
                await page.set_content(html, wait_until="networkidle")
            else:
                await page.set_content(html, wait_until="networkidle")
            await page.emulate_media(media="print")
            await page.pdf(
                path=str(pdf_path),
                format="A4",
                landscape=landscape,
                print_background=True,
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
            )
        finally:
            await browser.close()
    return pdf_path


async def export_file_to_pdf(
    html_path: Path,
    pdf_path: Path,
    *,
    landscape: bool = True,
) -> Path:
    """Render một file HTML cục bộ (``file://``) thành PDF."""
    async_playwright = _require_playwright()
    html_path = Path(html_path).resolve()
    pdf_path = Path(pdf_path)
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            page = await browser.new_page()
            await page.goto(html_path.as_uri(), wait_until="networkidle")
            await page.emulate_media(media="print")
            await page.pdf(
                path=str(pdf_path),
                format="A4",
                landscape=landscape,
                print_background=True,
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
            )
        finally:
            await browser.close()
    return pdf_path


def export_file_to_pdf_sync(html_path: Path, pdf_path: Path, *, landscape: bool = True) -> Path:
    """Bản đồng bộ tiện dùng trong script CLI."""
    return asyncio.run(export_file_to_pdf(html_path, pdf_path, landscape=landscape))


if __name__ == "__main__":  # pragma: no cover - tiện ích dòng lệnh
    import argparse

    parser = argparse.ArgumentParser(description="Xuất file HTML giáo án thành PDF (A4 landscape).")
    parser.add_argument("html", type=Path, help="Đường dẫn file HTML đầu vào")
    parser.add_argument("pdf", type=Path, help="Đường dẫn file PDF đầu ra")
    parser.add_argument("--portrait", action="store_true", help="Dùng khổ dọc thay vì ngang")
    args = parser.parse_args()
    result = export_file_to_pdf_sync(args.html, args.pdf, landscape=not args.portrait)
    print(f"Đã xuất PDF: {result}")
