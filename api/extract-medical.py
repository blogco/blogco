"""Vercel Function for free, server-side Vietnamese medical extraction."""

from http.server import BaseHTTPRequestHandler
import json
import os
import re

from underthesea import ner, sent_tokenize


MAX_RAW_TEXT = 20000
ALLOWED_CATEGORIES = {"Bệnh lý", "Thuốc", "Dinh dưỡng"}

LABEL_PATTERNS = {
    "title": re.compile(r"^(?:tên bệnh|tên thuốc|tiêu đề|title|disease|drug)\s*[:：]\s*(.+)$", re.I),
    "symptoms": re.compile(r"^(?:triệu chứng|symptoms?)\s*[:：]\s*(.+)$", re.I),
    "treatment": re.compile(r"^(?:điều trị|treatment|xử trí)\s*[:：]\s*(.+)$", re.I),
    "medications": re.compile(r"^(?:thuốc liên quan|thuốc|related medications?|medications?)\s*[:：]\s*(.+)$", re.I),
}

SYMPTOM_WORDS = (
    "sốt", "ho", "đau", "mệt", "buồn nôn", "nôn", "tiêu chảy", "phát ban",
    "khó thở", "chóng mặt", "nghẹt mũi", "đau họng", "đau đầu", "ngứa",
)
TREATMENT_WORDS = (
    "điều trị", "nghỉ ngơi", "uống", "dùng thuốc", "theo dõi", "liều", "phẫu thuật",
    "kháng sinh", "hạ sốt", "tái khám", "bù nước",
)
MEDICATION_WORDS = (
    "paracetamol", "acetaminophen", "oseltamivir", "ibuprofen", "amoxicillin",
    "cetirizine", "vitamin c", "metformin", "insulin", "omeprazole",
)


def clean(value, limit=600):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def unique(values, limit=24):
    result = []
    seen = set()
    for value in values:
        item = clean(value, 240).strip(" -•,;:")
        key = item.casefold()
        if item and key not in seen:
            seen.add(key)
            result.append(item)
    return result[:limit]


def split_values(value):
    return unique(re.split(r"[,;•\n]|\s+-\s+", value or ""))


def labeled_values(lines, label_name):
    values = []
    pattern = LABEL_PATTERNS[label_name]
    for index, line in enumerate(lines):
        match = pattern.match(line)
        if not match:
            continue
        values.extend(split_values(match.group(1)))
        for following in lines[index + 1:]:
            if any(other.match(following) for other in LABEL_PATTERNS.values()):
                break
            values.extend(split_values(following))
    return unique(values)


def labeled_text(lines, label_name):
    return clean(" ".join(labeled_values(lines, label_name)), 2400)


def ner_terms(raw_text):
    """Use underthesea NER when available; its entities are supporting signals."""
    terms = []
    try:
        for item in ner(raw_text):
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                word, tag = str(item[0]).strip(), str(item[-1]).strip()
                if word and tag and tag.upper() not in {"O", "0"}:
                    terms.append(word)
    except (RuntimeError, ValueError, TypeError):
        return []
    return unique(terms)


def extract_payload(raw_text, category):
    normalized = raw_text.replace("\r\n", "\n").strip()
    lines = [line.strip() for line in normalized.split("\n") if line.strip()]
    sentences = sent_tokenize(normalized)
    title = next(
        (match.group(1) for line in lines if (match := LABEL_PATTERNS["title"].match(line))),
        next((line.lstrip("# ") for line in lines if line.startswith("#")), lines[0]),
    )

    symptoms = labeled_values(lines, "symptoms")
    treatment = labeled_text(lines, "treatment")
    medications = labeled_values(lines, "medications")
    entities = ner_terms(normalized)

    if not symptoms:
        symptoms = unique(
            [sentence for sentence in sentences if any(word in sentence.casefold() for word in SYMPTOM_WORDS)]
        )
    if not treatment:
        treatment = clean(
            " ".join(sentence for sentence in sentences if any(word in sentence.casefold() for word in TREATMENT_WORDS)),
            2400,
        )
    known_medications = [
        medication.title() if medication != "vitamin c" else "Vitamin C"
        for medication in MEDICATION_WORDS
        if medication in normalized.casefold()
    ]
    medications = unique([*medications, *known_medications, *[term for term in entities if any(word in term.casefold() for word in MEDICATION_WORDS)]])

    return {
        "title": clean(title, 240),
        "category": category if category in ALLOWED_CATEGORIES else "Bệnh lý",
        "symptoms": symptoms,
        "treatment": treatment,
        "related_medications": medications,
        "raw_content": normalized[:MAX_RAW_TEXT],
        "metadata": {"sentence_count": len(sentences), "extractor": "underthesea"},
    }


def write_json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    origin = os.environ.get("MEDICAL_ALLOWED_ORIGIN", "*")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", origin)
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        write_json(self, 204, {})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_RAW_TEXT * 3:
                write_json(self, 413, {"error": "Văn bản quá dài hoặc không hợp lệ."})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            raw_text = str(payload.get("raw_text", "")).strip()
            if not raw_text:
                write_json(self, 400, {"error": "Thiếu trường raw_text."})
                return
            if len(raw_text) > MAX_RAW_TEXT:
                write_json(self, 413, {"error": f"raw_text tối đa {MAX_RAW_TEXT} ký tự."})
                return
            result = extract_payload(raw_text, str(payload.get("category", "Bệnh lý")))
            write_json(self, 200, result)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as error:
            write_json(self, 400, {"error": f"JSON không hợp lệ: {error}"})
        except Exception:
            write_json(self, 500, {"error": "Không thể phân tích văn bản lúc này."})

