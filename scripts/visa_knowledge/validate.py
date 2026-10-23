import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

CLAIM_TYPES = {
    "visa_requirement", "visa_exemption", "eligibility", "application_procedure",
    "required_document", "fee", "processing_time", "appointment_rule",
    "biometrics", "passport_requirement", "photo_specification", "official_application_link",
}
OFFICIAL_SUFFIXES = (".gov", ".gov.uk", ".gov.au", ".govt.nz", ".gov.sg", ".gov.in", ".gov.ca", ".gc.ca", ".go.kr", ".go.jp", ".gouv.fr", ".europa.eu", ".europa.ec")
OFFICIAL_HOSTS = {"travel.state.gov", "home-affairs.ec.europa.eu", "eur-lex.europa.eu", "www.gov.uk", "visa.go.kr", "www.mofa.go.jp", "www.immigration.govt.nz", "www.canada.ca", "www.thaievisa.go.th"}
CLAIM_FIELDS = {
    "claim_id", "destination_country", "passport_nationality", "residence_country", "visa_category",
    "claim_type", "claim_text", "source_id", "source_title", "source_url", "publisher",
    "publication_date", "effective_date", "last_verified_at", "verification_status",
    "review_status", "supersedes_claim_id",
}

def official_url(value):
    parsed = urlsplit(str(value or ""))
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and not parsed.username and not parsed.password and (host in OFFICIAL_HOSTS or any(host.endswith(suffix) for suffix in OFFICIAL_SUFFIXES))

def validate(dataset):
    if not isinstance(dataset, dict) or set(dataset) != {"version", "generated_at", "claims"} or dataset["version"] != 1 or not isinstance(dataset["claims"], list):
        raise ValueError("Expected only version, generated_at, and claims in the public dataset.")
    seen = set()
    for claim in dataset["claims"]:
        if not isinstance(claim, dict) or set(claim) != CLAIM_FIELDS:
            raise ValueError("A claim has missing or unapproved fields.")
        if not claim["claim_id"] or claim["claim_id"] in seen:
            raise ValueError("Claim IDs must be non-empty and unique.")
        seen.add(claim["claim_id"])
        if claim["claim_type"] not in CLAIM_TYPES or not str(claim["claim_text"]).strip():
            raise ValueError("Claim type or claim text is invalid.")
        if claim["review_status"] != "approved" or claim["verification_status"] != "verified_official":
            raise ValueError("Only human-approved official claims may be public.")
        if not official_url(claim["source_url"]):
            raise ValueError("A public source URL must use HTTPS and an official government or intergovernmental host.")
        if any(term in claim["claim_text"].casefold() for term in ("api_key", "bearer ", "gho_", "sk-proj-")):
            raise ValueError("A claim appears to contain a credential.")

def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("assets/js/passport-photo/visa-knowledge.json")
    try:
        validate(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError, IndexError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print("Visa knowledge dataset passed public privacy and schema checks.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
