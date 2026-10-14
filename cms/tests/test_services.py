from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import frontmatter

from cms.auth import create_session, hash_passcode, read_session, verify_passcode
from cms.services.file_service import save_article, validate_location
from cms.services.git_service import COMMIT_PATTERN


class AuthTests(unittest.TestCase):
    def test_passcode_hash_is_salted_and_verifies(self):
        first = hash_passcode("sample-passcode")
        second = hash_passcode("sample-passcode")
        self.assertNotEqual(first, second)
        with patch.dict(os.environ, {"CMS_ACCESS_HASH": first}):
            self.assertTrue(verify_passcode("sample-passcode"))
            self.assertFalse(verify_passcode("incorrect"))

    def test_session_is_signed_and_readable(self):
        with patch.dict(os.environ, {"CMS_SECRET_KEY": "test-session-secret-which-is-long-enough"}):
            token, csrf = create_session()
            self.assertEqual(read_session(token)["csrf"], csrf)
            self.assertIsNone(read_session(token + "tampered"))


class FileServiceTests(unittest.TestCase):
    def test_section_and_slug_are_allowlisted(self):
        with self.assertRaises(ValueError):
            validate_location("../../static", "cover")
        with self.assertRaises(ValueError):
            validate_location("posts", "../.env")

    def test_save_writes_hugo_front_matter_and_draft_flag(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("cms.services.file_service.ROOT", root):
                path = save_article({
                    "section": "posts", "slug": "cms-test-article", "title": "CMS test article",
                    "date": "2026-10-15", "category": "Kiến thức", "tags": "demo, cms",
                    "description": "A local test", "image": "", "summary": "Card summary", "content": "## Body\n\nTest content.",
                }, draft=True)
                post = frontmatter.load(path)
            self.assertTrue(post.metadata["draft"])
            self.assertEqual(post.metadata["categories"], ["Kiến thức"])
            self.assertIn("Test content", post.content)
            # Dates must carry the +07:00 offset and never be future-dated.
            self.assertRegex(str(post.metadata["date"]), r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$")

    def test_today_publish_uses_real_time_and_never_the_future(self):
        from datetime import datetime
        from cms.services.file_service import SITE_TIMEZONE, publish_timestamp

        today = datetime.now(SITE_TIMEZONE).date()
        stamp = datetime.fromisoformat(publish_timestamp(today))
        self.assertEqual(stamp.tzinfo, SITE_TIMEZONE)
        self.assertLessEqual(stamp, datetime.now(SITE_TIMEZONE))


class GitServiceTests(unittest.TestCase):
    def test_commit_message_requires_specific_conventional_format(self):
        self.assertTrue(COMMIT_PATTERN.fullmatch("feat(content): thêm bài viết qua CMS"))
        self.assertFalse(COMMIT_PATTERN.fullmatch("update"))


if __name__ == "__main__":
    unittest.main()
