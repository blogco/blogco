import unittest
from validate import validate

BASE = {
    "claim_id": "a1", "destination_country": "KR", "passport_nationality": "VN",
    "residence_country": "VN", "visa_category": "Tourist visa", "claim_type": "fee",
    "claim_text": "The government visa fee is KRW 100.", "source_id": "id1",
    "source_title": "Visa fee rules", "source_url": "https://visa.go.kr/fees",
    "publisher": "Government", "publication_date": None, "effective_date": None,
    "last_verified_at": "2026-10-01T00:00:00Z", "verification_status": "verified_official",
    "review_status": "approved", "supersedes_claim_id": None,
}

class PublicDatasetTests(unittest.TestCase):
    def test_accepts_sanitized_official_approved_claim(self):
        validate({"version": 1, "generated_at": None, "claims": [BASE]})

    def test_rejects_evidence_raw_text_review_data_and_unknown_fields(self):
        for extra in ("evidence_excerpt", "raw_text", "reviewer", "audit_history", "source_document", "secret"):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                validate({"version": 1, "generated_at": None, "claims": [{**BASE, extra: "private"}]})

    def test_rejects_unapproved_nonofficial_or_credential_data(self):
        invalid = [
            {**BASE, "review_status": "pending"},
            {**BASE, "verification_status": "unverified"},
            {**BASE, "source_url": "https://news.example/rule"},
            {**BASE, "claim_text": "The value uses sk-proj-secret."},
        ]
        for claim in invalid:
            with self.subTest(claim=claim), self.assertRaises(ValueError):
                validate({"version": 1, "generated_at": None, "claims": [claim]})

    def test_rejects_duplicate_ids(self):
        with self.assertRaisesRegex(ValueError, "unique"):
            validate({"version": 1, "generated_at": None, "claims": [BASE, BASE]})

if __name__ == "__main__":
    unittest.main()
