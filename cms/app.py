from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.trustedhost import TrustedHostMiddleware

from cms.auth import (
    LOGIN_CSRF_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE, create_session,
    read_session, verify_csrf, verify_passcode,
)
from cms.config import ROOT
from cms.services.file_service import ALLOWED_SECTIONS, load_article, save_article, save_uploaded_image
from cms.services.git_service import publish_article
from cms.services.training_service import save_training_sample

app = FastAPI(title="BlogCo CMS", docs_url=None, redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.mount("/cms-static", StaticFiles(directory=Path(__file__).parent / "static"), name="cms-static")
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")
failed_logins: dict[str, list[float]] = {}


def require_session(request: Request) -> dict:
    session = read_session(request.cookies.get(SESSION_COOKIE))
    if not session:
        raise HTTPException(status_code=401, detail="Phiên CMS đã hết hạn. Hãy đăng nhập lại.")
    return session


def page(request: Request, name: str, context: dict, *, status_code: int = 200) -> HTMLResponse:
    return templates.TemplateResponse(request=request, name=name, context={"request": request, **context}, status_code=status_code)


def login_redirect() -> RedirectResponse:
    return RedirectResponse("/", status_code=303)


def sections_for_dashboard() -> list[dict]:
    result = []
    for section in ALLOWED_SECTIONS:
        directory = ROOT / "content" / section
        if not directory.is_dir():
            continue
        for path in directory.glob("*.md"):
            try:
                article = load_article(section, path.stem)
            except (ValueError, OSError):
                continue
            result.append(article)
    return sorted(result, key=lambda article: (article["date"], article["title"].casefold()), reverse=True)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "BlogCo CMS", "local_only": True}


@app.get("/", response_class=HTMLResponse)
def login_page(request: Request) -> HTMLResponse:
    if read_session(request.cookies.get(SESSION_COOKIE)):
        return RedirectResponse("/dashboard", status_code=303)
    import secrets
    csrf = secrets.token_urlsafe(24)
    response = page(request, "login.html", {"error": "", "csrf": csrf})
    response.set_cookie(LOGIN_CSRF_COOKIE, csrf, httponly=True, samesite="strict", max_age=600, path="/")
    return response


@app.post("/login", response_class=HTMLResponse)
def login(request: Request, passcode: str = Form(...), csrf: str = Form(...)):
    cookie_csrf = request.cookies.get(LOGIN_CSRF_COOKIE)
    if not verify_csrf(cookie_csrf, csrf):
        raise HTTPException(status_code=403, detail="Phiên đăng nhập không hợp lệ; hãy tải lại trang.")
    now = time.monotonic()
    client = request.client.host if request.client else "local"
    attempts = [stamp for stamp in failed_logins.get(client, []) if now - stamp < 300]
    failed_logins[client] = attempts
    if len(attempts) >= 5:
        return page(request, "login.html", {"error": "Thử đăng nhập quá nhiều lần. Đợi 5 phút rồi thử lại.", "csrf": csrf}, status_code=429)
    if not verify_passcode(passcode):
        failed_logins[client].append(now)
        return page(request, "login.html", {"error": "Mã truy cập không đúng.", "csrf": csrf}, status_code=401)
    failed_logins.pop(client, None)
    token, session_csrf = create_session()
    response = RedirectResponse("/dashboard", status_code=303)
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict", max_age=SESSION_MAX_AGE, path="/")
    response.delete_cookie(LOGIN_CSRF_COOKIE, path="/")
    response.headers["X-CMS-CSRF"] = session_csrf
    return response


@app.post("/logout")
def logout(request: Request, csrf: str = Form(...), session: dict = Depends(require_session)):
    if not verify_csrf(session.get("csrf"), csrf):
        raise HTTPException(status_code=403, detail="Yêu cầu không hợp lệ.")
    response = RedirectResponse("/", status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    session = read_session(request.cookies.get(SESSION_COOKIE))
    if not session:
        return login_redirect()
    return page(request, "dashboard.html", {"csrf": session["csrf"], "articles": sections_for_dashboard(), "sections": ALLOWED_SECTIONS})


@app.get("/editor", response_class=HTMLResponse)
def editor(request: Request, section: str = "posts", slug: str = ""):
    session = read_session(request.cookies.get(SESSION_COOKIE))
    if not session:
        return login_redirect()
    if section not in ALLOWED_SECTIONS:
        raise HTTPException(status_code=400, detail="Chuyên mục không hợp lệ.")
    article = load_article(section, slug) if slug else load_article(section, "new-article")
    if not slug:
        article["slug"] = ""
    return page(request, "editor.html", {
        "csrf": session["csrf"], "article": article, "sections": ALLOWED_SECTIONS,
        "error": "", "success": "", "preview_url": "", "publish_result": None,
    })


@app.post("/save", response_class=HTMLResponse)
def save(
    request: Request,
    session: dict = Depends(require_session),
    csrf: str = Form(...), section: str = Form(...), slug: str = Form(...),
    title: str = Form(...), date: str = Form(...), category: str = Form(""),
    tags: str = Form(""), description: str = Form(""), image: str = Form(""),
    summary: str = Form(""), content: str = Form(...), draft: bool = Form(False),
    action: str = Form("save"), commit_message: str = Form(""),
):
    if not verify_csrf(session.get("csrf"), csrf):
        raise HTTPException(status_code=403, detail="Yêu cầu không hợp lệ.")
    if action not in {"save", "preview", "publish"}:
        raise HTTPException(status_code=400, detail="Thao tác không hợp lệ.")
    data = {"section": section, "slug": slug.strip(), "title": title, "date": date,
            "category": category, "tags": tags, "description": description, "image": image,
            "summary": summary, "content": content}
    error = ""
    success = ""
    publish_result = None
    try:
        saved_path = save_article(data, draft=(action != "publish" and draft))
        success = f"Đã lưu {saved_path.relative_to(ROOT).as_posix()}."
        if action == "publish":
            message = commit_message.strip() or f"feat(content): xuất bản bài {slug.strip()} qua CMS"
            publish_result = publish_article(section, slug.strip(), message, image.strip())
            success = f"Đã push {len(publish_result['files'])} file lên {publish_result['remote']} · {publish_result['branch']} · commit {publish_result['commit']}."
        elif action == "preview":
            success += " Bản nháp được giữ local; dùng liên kết preview bên dưới."
    except (ValueError, RuntimeError, OSError) as exception:
        error = str(exception)
    try:
        article = load_article(section, slug.strip())
    except ValueError:
        article = data | {"draft": True}
    preview_url = f"http://127.0.0.1:1313/blogco/{section}/{slug.strip()}/" if article.get("slug") else ""
    return page(request, "editor.html", {
        "csrf": session["csrf"], "article": article, "sections": ALLOWED_SECTIONS,
        "error": error, "success": success, "preview_url": preview_url, "publish_result": publish_result,
    }, status_code=400 if error else 200)


@app.post("/upload")
async def upload_image(
    csrf: str = Form(...), file: UploadFile = File(...), session: dict = Depends(require_session),
):
    if not verify_csrf(session.get("csrf"), csrf):
        raise HTTPException(status_code=403, detail="Yêu cầu không hợp lệ.")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Chọn ảnh trước khi tải lên.")
    data = await file.read(8 * 1024 * 1024 + 1)
    try:
        url, path = save_uploaded_image(file.filename, file.content_type or "", data)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return JSONResponse({"url": url, "filename": path.name})


# --- AI Training cho OCR -----------------------------------------------------
# Trang #/coffee/training gọi các endpoint này khi chạy CMS local. Chúng ghi mẫu
# ground truth vào data/ocr-training/<brand>/ rồi commit + push lên GitHub.


@app.get("/training/index")
def training_index() -> dict:
    index_path = ROOT / "data" / "ocr-training" / "index.json"
    try:
        return json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"brands": {}}


@app.post("/training/save")
def training_save(payload: dict = Body(...), session: dict = Depends(require_session)) -> dict:
    brand = str(payload.get("brand", "")).strip()
    sample = payload.get("sample") or {}
    patterns = payload.get("patterns") or {}
    message = str(payload.get("message", "")).strip()
    try:
        result = save_training_sample(brand, sample, patterns, message)
    except (ValueError, RuntimeError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"ok": True, **result}
