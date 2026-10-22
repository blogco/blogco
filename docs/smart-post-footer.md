# Blogco Smart Post Footer

The Hugo override `layouts/partials/extend_post_content.html` renders the footer after the body of published pages in `content/posts`. It uses generated data at `data/smart_post_footer/index.json`; the file is generated during CI and intentionally ignored by Git.

## Local build

```sh
python3 -m pip install -r scripts/smart_post_footer/requirements.txt
python3 scripts/smart_post_footer/build_index.py
npm run build:assets
hugo --gc --minify --baseURL "https://blogco.github.io/blogco/"
```

GitHub Actions runs the analyzer before Hugo and caches both the small PyYAML dependency and the prior corpus index. Q&A metadata is reused when an article content hash is unchanged. Related links are recalculated from the current published corpus on each analysis run, so renamed or deleted content cannot remain recommended.

## Editorial controls

All keys are optional. The default is enabled for published posts. Existing Markdown bodies and front matter are not rewritten by the analyzer.

```yaml
smartFooter:
  enabled: true
  qa: true
  copyright: true
  sources: true
  internalLinks: true
  id: stable-editorial-id
  qaItems:
    - question: "Câu hỏi đã được biên tập?"
      answer: "Câu trả lời đã được biên tập viên kiểm tra."
      supportingSections: ["Tên mục trong bài"]
  pinRelated:
    - posts/another-article.md
  excludeRelated:
    - posts/not-for-this-article.md
  sources:
    - title: "Tên tài liệu"
      author: "Tác giả, nếu được ghi nhận"
      publisher: "Đơn vị xuất bản"
      url: "https://example.org/document"
      publicationDate: "2025-01-01"
      accessedAt: "2025-02-01"
      sourceType: "primary"
```

Top-level `author`, `sources`, `citations`, `references`, `sourceReferences`, `canonicalURL`, `originalUrl`, `originalTitle`, `translatedFrom`, `adaptedFrom`, `license`, `date`, `lastmod`, `tags`, and `categories` are read when present. Only links inside a clearly named references section or explicitly declared metadata are treated as sources. Ordinary external links (including cover images) are not citations.

## Analysis approach and limits

The generator uses extractive Q&A from article headings, paragraphs, lists, and Markdown table values. It adds no model-generated facts and uses no remote LLM, model download, API key, or third-party inference service. It omits a candidate when its section has no concise supporting text, skips title-like headings and unsupported price questions, removes duplicate questions, and stores the section headings that support each answer.

Internal recommendations use local TF-IDF cosine similarity over title, summary, headings, tags, categories, keywords, and cleaned body text. Language mismatch lowers a score. The engine returns up to six candidates above a conservative threshold; Hugo resolves each article path to its actual generated permalink and drops missing, draft, or self targets. This lexical ranker is intentionally lightweight and may miss semantic relationships or translate none of the content. Editors can pin or exclude real article paths.

The corpus currently consists of the three published Markdown posts under `content/posts`. They do not declare authors, source citations, categories, tags, or last-modified metadata. The footer therefore shows the configured publisher, article dates, neutral third-party rights wording, no fabricated author or source list, and only recommendations that pass the local relevance threshold. FAQ JSON-LD is not emitted, avoiding duplication with existing BlogPosting structured data.
