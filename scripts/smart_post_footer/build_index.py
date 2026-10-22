#!/usr/bin/env python3
"""Build the deterministic Hugo data index for Blogco Smart Post Footer."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import yaml

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTENT = ROOT / "content" / "posts"
DEFAULT_OUTPUT = ROOT / "data" / "smart_post_footer" / "index.json"
VERSION = "1.2.1"
STOPWORDS = set("""
va la cua cho trong tren duoc voi mot nhung cac khi tu den ve theo nhu tai co la
thi se da dang nay do can duoc co the bai viet noi viet thong tin chi tiet
the this that with from into about there their which what when where how are
and for you your not but have has was were will can may should would article
""".split())
HEADING_RE = re.compile(r"^\s{0,3}(?P<marks>#{1,6})\s+(?P<title>.+?)\s*#*\s*$")
REFERENCE_HEADING = re.compile(r"^(?:nguon(?: tham khao)?|tai lieu tham khao|tham khao|references|sources|bibliography|출처|참고 문헌)\s*:?$", re.I)
URL_RE = re.compile(r"https?://[^\s)\]>]+", re.I)


def normalize_space(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def fold_text(value: str) -> str:
    value = re.sub(r"[đĐ]", "d", value.casefold())
    return "".join(char for char in unicodedata.normalize("NFD", value) if unicodedata.category(char) != "Mn")


def is_reference_heading(value: str) -> bool:
    if REFERENCE_HEADING.match(value):
        return True
    return bool(REFERENCE_HEADING.match(fold_text(value)))


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    match = re.match(r"\A---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)", raw, re.S)
    if not match:
        raise ValueError("missing YAML front matter")
    metadata = yaml.safe_load(match.group(1)) or {}
    if not isinstance(metadata, dict):
        raise ValueError("front matter must be a mapping")
    return metadata, raw[match.end():]


def clean_markdown(markdown: str) -> str:
    text = re.sub(r"```.*?```|~~~.*?~~~", " ", markdown, flags=re.S)
    text = re.sub(r"(?m)^\s*\[[^\]]+\]:\s*\S+.*$", " ", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^ )]+)(?:\s+[^)]*)?\)", r"\1", text)
    text = re.sub(r"<https?://[^>]+>|<[^>]+>", " ", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$", " ", text, flags=re.M)
    text = re.sub(r"[|*_`~]", " ", text)
    text = re.sub(r"(?m)^\s*(?:[-+*]|\d+[.)])\s+", "", text)
    return normalize_space(text)


def detect_language(metadata: dict, body: str) -> str:
    explicit = normalize_space(metadata.get("language") or metadata.get("lang") or "").lower()
    if explicit.startswith("ko"):
        return "ko"
    if explicit.startswith("en"):
        return "en"
    if explicit.startswith("vi"):
        return "vi"
    if re.search(r"[\uac00-\ud7af]", body):
        return "ko"
    if re.search(r"[ăâđêôơưĂÂĐÊÔƠƯà-ỹÀ-Ỹ]", body):
        return "vi"
    return "en"


def split_sections(markdown: str) -> list[dict]:
    sections = [{"heading": "", "lines": [], "reference": False}]
    for line in markdown.splitlines():
        match = HEADING_RE.match(line)
        if match:
            heading = normalize_space(re.sub(r"\\([.#])", r"\1", match.group("title")))
            sections.append({"heading": heading, "level": len(match.group("marks")), "lines": [], "reference": is_reference_heading(heading)})
        else:
            sections[-1]["lines"].append(line)
    return sections


def validate_url(value: object) -> str | None:
    raw = normalize_space(value)
    try:
        parsed = urlsplit(raw)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            return None
        host = parsed.hostname.encode("idna").decode("ascii").lower()
        port = f":{parsed.port}" if parsed.port else ""
        return urlunsplit((parsed.scheme.lower(), host + port, parsed.path, parsed.query, parsed.fragment))
    except (ValueError, UnicodeError):
        return None


def normalize_sources(values: object, source_type: str) -> list[dict]:
    if isinstance(values, (str, dict)):
        values = [values]
    if not isinstance(values, list):
        return []
    found, seen = [], set()
    for value in values:
        item = {"title": value} if isinstance(value, str) else value if isinstance(value, dict) else {}
        url = validate_url(item.get("url") or item.get("href"))
        title = normalize_space(item.get("title") or item.get("name"))
        if not url or (url, title) in seen:
            continue
        seen.add((url, title))
        found.append({
            "title": title, "author": normalize_space(item.get("author")),
            "publisher": normalize_space(item.get("publisher")), "url": url,
            "publicationDate": normalize_space(item.get("publicationDate") or item.get("datePublished")),
            "accessedAt": normalize_space(item.get("accessedAt")),
            "sourceType": normalize_space(item.get("sourceType")) or source_type,
        })
    return found


def extract_sources(metadata: dict, sections: list[dict]) -> list[dict]:
    smart = metadata.get("smartFooter") or metadata.get("smartfooter") or {}
    declared = []
    for key in ("sources", "citations", "references", "sourceReferences"):
        declared.extend(normalize_sources(metadata.get(key), "front_matter"))
    if isinstance(smart, dict):
        declared.extend(normalize_sources(smart.get("sources"), "editorial"))
    seen = {(item["url"], item["title"]) for item in declared}
    for section in sections:
        if not section["reference"]:
            continue
        for line in section["lines"]:
            md_link = re.search(r"\[([^\]]+)\]\((https?://[^ )]+)\)", line)
            raw_url = md_link.group(2) if md_link else (URL_RE.search(line).group(0).rstrip(".,;") if URL_RE.search(line) else "")
            url = validate_url(raw_url)
            title = normalize_space(md_link.group(1)) if md_link else ""
            if url and (url, title) not in seen:
                seen.add((url, title))
                declared.append({"title": title, "author": "", "publisher": "", "url": url,
                                 "publicationDate": "", "accessedAt": "", "sourceType": "references_section"})
    return declared


def plain_blocks(section: dict) -> tuple[list[str], list[str], list[list[str]]]:
    paragraphs, items, rows, current = [], [], [], []
    for line in section["lines"] + [""]:
        stripped = line.strip()
        if not stripped:
            if current:
                paragraphs.append(clean_markdown(" ".join(current)))
                current = []
            continue
        if stripped.startswith("|") and stripped.endswith("|"):
            if current:
                paragraphs.append(clean_markdown(" ".join(current)))
                current = []
            cells = [clean_markdown(cell) for cell in stripped.strip("|").split("|")]
            if cells and not all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                rows.append(cells)
        elif re.match(r"^\s*(?:[-+*]|\d+[.)])\s+", line):
            if current:
                paragraphs.append(clean_markdown(" ".join(current)))
                current = []
            item = clean_markdown(re.sub(r"^\s*(?:[-+*]|\d+[.)])\s+", "", line))
            if item:
                items.append(item)
        else:
            current.append(stripped)
    return [value for value in paragraphs if value], items, rows


def make_question(heading: str, language: str) -> str:
    value = re.sub(r"^\d+[.)]\s*", "", normalize_space(heading)).rstrip("?.!。？！")
    folded = value.lower()
    if not value:
        return ""
    if re.search(r"[?？]$", heading):
        return value + "?"
    if language == "ko":
        if any(term in value for term in ("가격", "비용")):
            return f"{value}은 얼마인가요?"
        if any(term in value for term in ("절차", "방법", "과정")):
            return f"{value}은 어떤 순서로 진행되나요?"
        return ""
    if language == "en":
        if any(term in folded for term in ("price", "cost", "fee")):
            return f"What is the {value}?"
        if any(term in folded for term in ("process", "steps", "schedule")):
            return f"What steps are included in {value}?"
        return ""
    if any(term in folded for term in ("bảng giá", "giá ", "chi phí", "lệ phí")):
        return f"{value} có giá bao nhiêu?"
    if any(term in folded for term in ("quy trình", "các bước", "hướng dẫn")):
        return f"{value} gồm những bước nào?"
    if "phác đồ" in folded:
        return f"{value} được thực hiện như thế nào?"
    if "đối tượng" in folded:
        return f"{value} áp dụng cho những ai?"
    if any(term in folded for term in ("thời gian", "bao lâu")):
        return f"{value} kéo dài trong bao lâu?"
    return ""


def answer_from_section(section: dict, language: str) -> str:
    paragraphs, items, rows = plain_blocks(section)
    if rows:
        entries = []
        for row in rows[1:6]:
            if len(row) >= 2:
                label = row[0]
                value = next((cell for cell in reversed(row[1:]) if cell), "")
                if label and value:
                    entries.append(f"{label}: {value}")
        if entries:
            prefix = {"vi": "Bài viết liệt kê: ", "ko": "글에는 다음 항목이 있습니다: "}.get(language, "The article lists: ")
            return prefix + "; ".join(entries)
    heading = section["heading"].casefold()
    if any(term in heading for term in ("bảng giá", "giá ", "chi phí", "lệ phí", "price", "cost", "fee", "가격", "비용")):
        return ""
    if items:
        return ""
    for paragraph in paragraphs:
        sentences = re.split(r"(?<=[.!?。？！])\s+", paragraph)
        answer = " ".join(sentences[:2])
        if 45 <= len(answer) <= 420:
            return answer
    return ""


def generate_qa(body: str, language: str, previous: dict | None, content_hash: str, overrides: object, article_title: str = "") -> list[dict]:
    if isinstance(overrides, list):
        return [{"question": normalize_space(row.get("question")), "answer": normalize_space(row.get("answer")),
                 "supportingSections": row.get("supportingSections", [])}
                for row in overrides if isinstance(row, dict) and normalize_space(row.get("question")) and normalize_space(row.get("answer"))]
    if previous and previous.get("contentHash") == content_hash and isinstance(previous.get("qa"), list):
        return previous["qa"]
    output, seen = [], set()
    for section_index, section in enumerate(split_sections(body)):
        if not section["heading"] or section["reference"]:
            continue
        if section_index == 1 and article_title:
            title_terms, heading_terms = set(tokenize(article_title)), set(tokenize(section["heading"]))
            if title_terms and len(title_terms & heading_terms) / len(title_terms) >= 0.6:
                continue
        question = make_question(section["heading"], language)
        if not question:
            continue
        answer = answer_from_section(section, language)
        key = re.sub(r"\W+", " ", question.casefold()).strip()
        duplicate = any(difflib.SequenceMatcher(None, key, old).ratio() >= 0.88 for old in seen)
        if question and answer and len(key) > 12 and key not in seen and not duplicate:
            output.append({"question": question, "answer": answer, "supportingSections": [section["heading"]]})
            seen.add(key)
        if len(output) == 5:
            break
    return output


def tokenize(text: str) -> list[str]:
    text = fold_text(text)
    return [term for term in re.findall(r"[a-z0-9]{2,}|[\uac00-\ud7af]{2,}", text)
            if term not in STOPWORDS and not term.isdigit()]


def article_terms(article: dict) -> Counter:
    result = Counter()
    fields = [(article["title"], 4), (article["summary"], 2), (" ".join(article["headings"]), 2),
              (" ".join(article["tags"] + article["categories"] + article["keywords"]), 3), (article["bodyText"], 1)]
    for value, weight in fields:
        result.update({term: count * weight for term, count in Counter(tokenize(value)).items()})
    return result


def rank_related(articles: list[dict]) -> dict[str, list[dict]]:
    total = len(articles)
    bags = {item["articleId"]: article_terms(item) for item in articles}
    doc_freq = Counter(term for bag in bags.values() for term in bag)
    vectors = {}
    for article_id, bag in bags.items():
        weighted = {term: count * (math.log((total + 1) / (doc_freq[term] + 0.5)) + 1) for term, count in bag.items()}
        norm = math.sqrt(sum(value * value for value in weighted.values())) or 1
        vectors[article_id] = {term: value / norm for term, value in weighted.items()}
    result = {}
    for article in articles:
        ranked = []
        for candidate in articles:
            if candidate["articleId"] == article["articleId"] or not candidate["published"]:
                continue
            shared = set(vectors[article["articleId"]]) & set(vectors[candidate["articleId"]])
            score = sum(vectors[article["articleId"]][term] * vectors[candidate["articleId"]][term] for term in shared)
            if candidate["language"] != article["language"]:
                score *= 0.55
            if score >= 0.18 and len(shared) >= 2:
                ranked.append({"articleId": candidate["articleId"], "path": candidate["path"], "score": round(score, 6), "pinned": False})
        config = article["smartFooter"]
        excluded = set(map(str, config.get("excludeRelated", []))) if isinstance(config.get("excludeRelated", []), list) else set()
        ranked = [item for item in ranked if item["articleId"] not in excluded and item["path"] not in excluded]
        pins = config.get("pinRelated", []) if isinstance(config.get("pinRelated", []), list) else []
        ranked_ids = {item["articleId"] for item in ranked}
        for pin in pins:
            candidate = next((item for item in articles if pin in (item["articleId"], item["path"])), None)
            if candidate and candidate["articleId"] != article["articleId"] and candidate["articleId"] not in ranked_ids:
                ranked.append({"articleId": candidate["articleId"], "path": candidate["path"], "score": 0, "pinned": True})
                ranked_ids.add(candidate["articleId"])
        for order, pin in enumerate(pins):
            for item in ranked:
                if pin in (item["articleId"], item["path"]):
                    item["pinned"], item["pinOrder"] = True, order
        ranked.sort(key=lambda item: (not item["pinned"], item.get("pinOrder", 0), -item["score"], item["articleId"]))
        result[article["articleId"]] = ranked[:6]
    return result


def list_field(value: object) -> list[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list):
        return [normalize_space(item) for item in value if normalize_space(item)]
    return []


def parse_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = normalize_space(value)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            return None


def discover_articles(content_dir: Path) -> list[dict]:
    articles, today = [], datetime.now(timezone.utc).date()
    for path in sorted(content_dir.rglob("*.md")):
        raw = path.read_text(encoding="utf-8")
        metadata, body = parse_frontmatter(raw)
        if metadata.get("draft") is True or str(metadata.get("draft", "")).lower() == "true" or metadata.get("private") is True:
            continue
        publish_date = metadata.get("publishDate") or metadata.get("date")
        date_value = parse_date(publish_date)
        if isinstance(date_value, date) and date_value > today:
            continue
        relative = path.relative_to(content_dir.parent).as_posix()
        config = metadata.get("smartFooter") or metadata.get("smartfooter") or {}
        config = config if isinstance(config, dict) else {}
        article_id = normalize_space(config.get("id")) or relative
        sections = split_sections(body)
        articles.append({
            "articleId": article_id, "path": relative,
            "title": normalize_space(metadata.get("title") or path.stem),
            "language": detect_language(metadata, body),
            "summary": normalize_space(metadata.get("description") or metadata.get("summary") or ""),
            "headings": [section["heading"] for section in sections if section["heading"]],
            "categories": list_field(metadata.get("categories")), "tags": list_field(metadata.get("tags")),
            "keywords": list_field(metadata.get("keywords")),
            "publicationDate": publish_date.isoformat() if hasattr(publish_date, "isoformat") else normalize_space(publish_date),
            "updatedAt": normalize_space(metadata.get("lastmod") or metadata.get("lastMod") or ""),
            "contentHash": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            "outboundLinks": sorted({validated for url in URL_RE.findall(body) if (validated := validate_url(url))}),
            "bodyText": clean_markdown(body), "markdown": body, "metadata": metadata,
            "smartFooter": config, "sections": sections, "published": True,
        })
    return articles


def build_index(content_dir: Path, previous_payload: dict | None = None) -> dict:
    previous = (previous_payload or {}).get("articles", {}) if (previous_payload or {}).get("generatorVersion") == VERSION else {}
    corpus = discover_articles(content_dir)
    related = rank_related(corpus)
    result = {}
    for article in corpus:
        config = article["smartFooter"]
        old = previous.get(article["articleId"], {}) if isinstance(previous, dict) else {}
        qa = generate_qa(article["markdown"], article["language"], old, article["contentHash"], config.get("qaItems"), article["title"]) if config.get("qa", True) is not False else []
        sources = extract_sources(article["metadata"], article["sections"]) if config.get("sources", True) is not False else []
        links = related[article["articleId"]] if config.get("internalLinks", True) is not False else []
        result[article["articleId"]] = {
            key: article[key] for key in ("articleId", "path", "title", "language", "summary", "headings", "categories", "tags", "keywords", "publicationDate", "updatedAt", "contentHash", "outboundLinks")
        } | {"qa": qa, "sources": sources, "relatedArticles": links}
    return {"generatorVersion": VERSION, "articles": result}


def write_if_changed(path: Path, payload: dict) -> bool:
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == serialized:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialized, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content-dir", type=Path, default=DEFAULT_CONTENT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        previous = None
        if args.output.exists():
            try:
                previous = json.loads(args.output.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                previous = None
        payload = build_index(args.content_dir.resolve(), previous)
        changed = write_if_changed(args.output, payload)
        print(f"Smart Post Footer indexed {len(payload['articles'])} published posts; metadata {'updated' if changed else 'unchanged'}.")
        return 0
    except (OSError, ValueError, yaml.YAMLError) as error:
        print(f"Smart Post Footer: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
