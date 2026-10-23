const CATEGORY_STOP_WORDS = new Set(['visa','type','class','category','short','stay','for','a','the','(tourism)','tourism']);

function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function scopeMatches(actual, expected) {
  const left = normalize(actual);
  const right = normalize(expected);
  return !left || left === 'any' || left === '*' || left === right;
}

function categoryMatches(actual, expected) {
  const left = normalize(actual);
  const right = normalize(expected);
  if (!left || left === 'any' || left === '*' || left === right) return true;
  const leftTokens = left.split(' ').filter((token) => !CATEGORY_STOP_WORDS.has(token));
  const rightTokens = right.split(' ').filter((token) => !CATEGORY_STOP_WORDS.has(token));
  if (!leftTokens.length || !rightTokens.length) return false;
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return overlap / Math.max(leftTokens.length, rightTokens.length) >= 0.65;
}

function withinDates(claim, asOfDate) {
  if (claim.effective_date && claim.effective_date > asOfDate) return false;
  if (claim.publication_date && claim.publication_date > asOfDate) return false;
  return true;
}

function sourceAgeDays(lastVerifiedAt, asOfDate) {
  const checked = Date.parse(lastVerifiedAt || '');
  const current = Date.parse(asOfDate + 'T00:00:00Z');
  if (!Number.isFinite(checked) || !Number.isFinite(current)) return Infinity;
  return Math.max(0, Math.floor((current - checked) / 86400000));
}

function likelyContradiction(leftText, rightText) {
  const left = normalize(leftText);
  const right = normalize(rightText);
  const leftTokens = left.replace(/\d+(?:[.,]\d+)?/g, ' ').split(/\s+/).filter(Boolean);
  const rightTokens = right.replace(/\d+(?:[.,]\d+)?/g, ' ').split(/\s+/).filter(Boolean);
  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  if (!leftTokens.length || !rightTokens.length || overlap / Math.max(leftTokens.length, rightTokens.length) < 0.6) return false;

  const negative = /\b(no|not|never|without|cannot|免|不|未|无|無|아니|없|않|면제|불필요)\b/u;
  const leftNegative = negative.test(left) || ['免', '不', '未', '无', '無', '아니', '없', '않', '면제', '불필요'].some((term) => left.includes(term));
  const rightNegative = negative.test(right) || ['免', '不', '未', '无', '無', '아니', '없', '않', '면제', '불필요'].some((term) => right.includes(term));
  if (leftNegative !== rightNegative) return true;

  const numbers = (value) => value.match(/\d+(?:[.,]\d+)?/g) || [];
  const leftNumbers = numbers(left);
  const rightNumbers = numbers(right);
  return leftNumbers.length > 0 && rightNumbers.length > 0
    && leftNumbers.join('|') !== rightNumbers.join('|');
}

export function retrieveApprovedClaims(dataset, profile, asOfDate = new Date().toISOString().slice(0, 10)) {
  const claims = Array.isArray(dataset?.claims) ? dataset.claims : [];
  const destination = String(profile?.destinationCountry || '').toUpperCase();
  const nationality = String(profile?.passportNationality || '').toUpperCase();
  const residence = String(profile?.residenceCountry || '').toUpperCase();
  const category = profile?.visaCategory || '';
  if (!destination || !nationality) return { claims: [], hasConflicts: false };

  const matching = claims.filter((claim) => (
    claim?.review_status === 'approved'
    && claim?.verification_status === 'verified_official'
    && scopeMatches(claim.destination_country, destination)
    && scopeMatches(claim.passport_nationality, nationality)
    && scopeMatches(claim.residence_country, residence)
    && categoryMatches(claim.visa_category, category)
    && withinDates(claim, asOfDate)
    && typeof claim.claim_text === 'string'
    && typeof claim.source_url === 'string'
    && claim.source_url.startsWith('https://')
  )).map((claim) => ({
    ...claim,
    sourceAgeDays: sourceAgeDays(claim.last_verified_at, asOfDate),
  }));

  const score = (claim) => (
    (claim.destination_country ? 16 : 0)
    + (claim.passport_nationality ? 12 : 0)
    + (claim.residence_country ? 6 : 0)
    + (normalize(claim.visa_category) === normalize(category) ? 8 : 2)
    + Math.max(0, 6 - Math.floor(claim.sourceAgeDays / 30))
  );
  matching.sort((a, b) => score(b) - score(a) || (b.effective_date || '').localeCompare(a.effective_date || ''));
  const hasConflicts = matching.some((claim, index) => matching.slice(index + 1).some((other) => (
    claim.claim_type === other.claim_type && likelyContradiction(claim.claim_text, other.claim_text)
  )));
  return { claims: matching.slice(0, 20), hasConflicts };
}

export function isStaleKnowledge(claim, asOfDate = new Date().toISOString().slice(0, 10)) {
  return sourceAgeDays(claim?.last_verified_at, asOfDate) > 180;
}
