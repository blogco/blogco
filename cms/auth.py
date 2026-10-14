from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from cms.config import access_hash, cms_secret

SESSION_COOKIE = "cms_session"
LOGIN_CSRF_COOKIE = "cms_login_csrf"
SESSION_MAX_AGE = 8 * 60 * 60
PBKDF2_ROUNDS = 600_000


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def hash_passcode(passcode: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", passcode.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${_b64(salt)}${_b64(digest)}"


def verify_passcode(passcode: str) -> bool:
    try:
        algorithm, rounds, salt_text, digest_text = access_hash().split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        decode = lambda text: base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
        salt, expected = decode(salt_text), decode(digest_text)
        actual = hashlib.pbkdf2_hmac("sha256", passcode.encode("utf-8"), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except (RuntimeError, ValueError, TypeError):
        return False


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(cms_secret(), salt="blogco-cms-session-v1")


def create_session() -> tuple[str, str]:
    csrf = secrets.token_urlsafe(24)
    return _serializer().dumps({"authenticated": True, "csrf": csrf}), csrf


def read_session(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        data = _serializer().loads(token, max_age=SESSION_MAX_AGE)
        return data if data.get("authenticated") is True and isinstance(data.get("csrf"), str) else None
    except (BadSignature, SignatureExpired, RuntimeError):
        return None


def verify_csrf(expected: str | None, submitted: str | None) -> bool:
    return bool(expected and submitted and hmac.compare_digest(expected, submitted))
