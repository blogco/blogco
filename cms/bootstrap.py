from __future__ import annotations

import getpass
import os
import secrets
from pathlib import Path

from cms.auth import hash_passcode
from cms.config import ROOT


def main() -> None:
    env_path = ROOT / ".env"
    if env_path.exists():
        if env_path.is_symlink():
            raise SystemExit("Refusing to use a symlink as .env.")
        print("CMS security configuration already exists in .env.")
        return

    first = getpass.getpass("Create a local CMS access code (input is hidden): ")
    second = getpass.getpass("Enter it again: ")
    if len(first) < 4 or first != second:
        raise SystemExit("Codes must match and contain at least 4 characters.")

    secret = secrets.token_urlsafe(48)
    contents = f"CMS_ACCESS_HASH={hash_passcode(first)}\nCMS_SECRET_KEY={secret}\n"
    descriptor = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as env_file:
        env_file.write(contents)
    print("Created .env with a salted PBKDF2-SHA256 hash and a random session secret (mode 0600).")


if __name__ == "__main__":
    main()
