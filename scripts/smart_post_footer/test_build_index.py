import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_index as smart_footer


class SmartFooterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.content = self.root / "content" / "posts"
        self.content.mkdir(parents=True)

    def tearDown(self):
        self.temp.cleanup()

    def write_post(self, name, title, body, front=""):
        path = self.content / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\ntitle: {title}\ndate: 2025-01-01\n{front}---\n{body}\n", encoding="utf-8")
        return path

    def test_discovery_parses_front_matter_and_excludes_draft_and_future_posts(self):
        self.write_post("live.md", "Bài tiếng Việt", "## Nội dung\n\nĐây là nội dung đủ dài.")
        self.write_post("draft.md", "Nháp", "Nội dung.", "draft: true\n")
        self.write_post("future.md", "Tương lai", "Nội dung.", "date: 2999-01-01\n")
        articles = smart_footer.discover_articles(self.content)
        self.assertEqual([article["articleId"] for article in articles], ["posts/live.md"])
        self.assertEqual(articles[0]["language"], "vi")

    def test_markdown_cleanup_and_language_detection_preserve_unicode(self):
        cleaned = smart_footer.clean_markdown("## Tiếng Việt\n\n**Xin chào** [liên kết](https://example.com)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |")
        self.assertIn("Tiếng Việt", cleaned)
        self.assertIn("Xin chào", cleaned)
        self.assertNotIn("https://example.com", cleaned)
        self.assertEqual(smart_footer.detect_language({}, "한국어 문장입니다"), "ko")
        self.assertEqual(smart_footer.detect_language({"lang": "en"}, "Short text"), "en")

    def test_hash_is_stable_for_identical_content_and_changes_with_content(self):
        post = self.write_post("a.md", "A", "## Heading\n\nA supported paragraph with enough information.")
        first = smart_footer.discover_articles(self.content)[0]["contentHash"]
        self.assertEqual(first, smart_footer.discover_articles(self.content)[0]["contentHash"])
        post.write_text(post.read_text(encoding="utf-8").replace("enough", "verified"), encoding="utf-8")
        self.assertNotEqual(first, smart_footer.discover_articles(self.content)[0]["contentHash"])

    def test_qa_is_extractive_deduplicated_and_skips_unsupported_price_claims(self):
        body = "## Bảng giá tham khảo\n\nChỉ giới thiệu bảng giá trong bài.\n\n## Quy trình\n\nQuy trình gồm các bước rõ ràng và được mô tả trong bài viết này.\n\n## Quy trình\n\nQuy trình gồm các bước rõ ràng và được mô tả trong bài viết này."
        qa = smart_footer.generate_qa(body, "vi", None, "hash", None)
        self.assertEqual(len(qa), 1)
        self.assertIn("Quy trình gồm các bước rõ ràng", qa[0]["answer"])
        self.assertNotIn("giá", qa[0]["question"].lower())

    def test_table_answers_use_values_from_article_table(self):
        body = "## Bảng giá vắc xin\n\n| Tên | Giá |\n| --- | --- |\n| Vắc xin A | 100.000 đồng |"
        qa = smart_footer.generate_qa(body, "vi", None, "hash", None, "Bài khác")
        self.assertEqual(len(qa), 1)
        self.assertIn("Vắc xin A: 100.000 đồng", qa[0]["answer"])

    def test_source_extraction_requires_declared_reference_context_and_valid_urls(self):
        metadata = {"sources": [{"title": "Nguồn được khai báo", "url": "https://example.com/ref", "publisher": "Nhà xuất bản"}]}
        sections = smart_footer.split_sections("Một link thường https://ordinary.example/\n\n## Nguồn tham khảo\n\n- [Nguồn trong bài](https://source.example/doc)")
        sources = smart_footer.extract_sources(metadata, sections)
        self.assertEqual({source["url"] for source in sources}, {"https://example.com/ref", "https://source.example/doc"})
        self.assertNotIn("https://ordinary.example/", {source["url"] for source in sources})

    def test_external_url_validation_allows_http_and_https_only(self):
        self.assertEqual(smart_footer.validate_url("HTTPS://Example.COM/a"), "https://example.com/a")
        for value in ("javascript:alert(1)", "ftp://example.com/file", "https://user:pass@example.com/"):
            self.assertIsNone(smart_footer.validate_url(value))

    def test_related_ranking_excludes_self_drafts_and_unrelated_articles(self):
        self.write_post("vaccine-a.md", "Vắc xin cúm tại Pasteur", "## Tiêm chủng\n\nTiêm vắc xin cúm tại Viện Pasteur, bảng giá và lịch tiêm tham khảo.")
        self.write_post("vaccine-b.md", "Bảng giá tiêm cúm", "## Vắc xin cúm\n\nGiá tiêm vắc xin cúm tại Pasteur và lịch tiêm chủng.")
        self.write_post("python.md", "Lập trình Python", "## API Python\n\nHướng dẫn viết chương trình Python và thiết kế API web.")
        self.write_post("draft.md", "Nháp vắc xin", "Nội dung", "draft: true\n")
        corpus = smart_footer.discover_articles(self.content)
        ranked = smart_footer.rank_related(corpus)["posts/vaccine-a.md"]
        self.assertEqual([item["articleId"] for item in ranked], ["posts/vaccine-b.md"])

    def test_editorial_overrides_disable_qa_and_pin_or_exclude_real_articles(self):
        self.write_post("a.md", "A", "## A\n\nNội dung A.", "smartFooter:\n  qa: false\n  pinRelated:\n    - posts/unrelated.md\n  excludeRelated:\n    - posts/related.md\n")
        self.write_post("related.md", "Bài liên quan", "## A\n\nNội dung A có thêm thông tin về chủ đề đặc biệt để liên kết.")
        self.write_post("unrelated.md", "Chủ đề xa", "## B\n\nNội dung về một chủ đề hoàn toàn xa.")
        index = smart_footer.build_index(self.content)
        record = index["articles"]["posts/a.md"]
        self.assertEqual(record["qa"], [])
        self.assertEqual(record["relatedArticles"][0]["articleId"], "posts/unrelated.md")
        self.assertTrue(record["relatedArticles"][0]["pinned"])
        self.assertNotIn("posts/related.md", {item["articleId"] for item in record["relatedArticles"]})

    def test_qa_overrides_are_preserved_without_editing_article_body(self):
        path = self.write_post("override.md", "Override", "## Bất kỳ\n\nMột đoạn nội dung gốc đủ dài để lưu.", "smartFooter:\n  qaItems:\n    - question: Câu hỏi do biên tập viên viết?\n      answer: Câu trả lời được biên tập viên duyệt.\n")
        before = path.read_bytes()
        index = smart_footer.build_index(self.content)
        self.assertEqual(index["articles"]["posts/override.md"]["qa"][0]["answer"], "Câu trả lời được biên tập viên duyệt.")
        self.assertEqual(path.read_bytes(), before)

    def test_deleted_and_renamed_posts_do_not_leave_stale_recommendations(self):
        self.write_post("source.md", "Vắc xin cúm", "## Tiêm chủng\n\nTiêm cúm tại Pasteur, lịch tiêm và giá tham khảo.")
        self.write_post("old.md", "Giá tiêm cúm", "## Vắc xin cúm\n\nGiá tiêm tại Pasteur và lịch tiêm chủng.")
        old = smart_footer.build_index(self.content)
        (self.content / "old.md").unlink()
        self.write_post("renamed.md", "Kiến trúc tĩnh", "## Website\n\nKiến trúc web tĩnh bằng HTML và JavaScript.")
        new = smart_footer.build_index(self.content, old)
        ids = {article_id for article_id in new["articles"]}
        self.assertNotIn("posts/old.md", ids)
        self.assertIn("posts/renamed.md", ids)
        self.assertNotIn("posts/old.md", {item["articleId"] for item in new["articles"]["posts/source.md"]["relatedArticles"]})

    def test_unchanged_inputs_produce_identical_deterministic_metadata(self):
        self.write_post("a.md", "Bài A", "## Thông tin\n\nMột câu trả lời có đủ dữ liệu trong bài viết.")
        first = smart_footer.build_index(self.content)
        second = smart_footer.build_index(self.content, first)
        self.assertEqual(json.dumps(first, ensure_ascii=False, sort_keys=True), json.dumps(second, ensure_ascii=False, sort_keys=True))
        output = self.root / "data" / "index.json"
        self.assertTrue(smart_footer.write_if_changed(output, first))
        before = output.stat().st_mtime_ns
        self.assertFalse(smart_footer.write_if_changed(output, second))
        self.assertEqual(output.stat().st_mtime_ns, before)


if __name__ == "__main__":
    unittest.main()
