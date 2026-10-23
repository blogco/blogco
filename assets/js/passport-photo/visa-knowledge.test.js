import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaleKnowledge, retrieveApprovedClaims } from './visa-knowledge.js';

function claim(overrides = {}) {
  return {
    claim_id: 'claim-1',
    destination_country: 'KR',
    passport_nationality: 'VN',
    residence_country: 'VN',
    visa_category: 'Tourist visa',
    claim_type: 'fee',
    claim_text: 'Official visa fee is KRW 100.',
    source_url: 'https://visa.go.kr/fees',
    effective_date: '2026-01-01',
    publication_date: '2026-01-01',
    last_verified_at: '2026-09-01T00:00:00Z',
    verification_status: 'verified_official',
    review_status: 'approved',
    ...overrides,
  };
}

test('retrieves only approved official claims that match traveler scope and effective date', () => {
  const data = { claims: [
    claim(),
    claim({ claim_id: 'wrong-nationality', passport_nationality: 'JP' }),
    claim({ claim_id: 'pending', review_status: 'pending' }),
    claim({ claim_id: 'unverified', verification_status: 'unverified' }),
    claim({ claim_id: 'future', effective_date: '2027-01-01' }),
  ] };
  const result = retrieveApprovedClaims(data, {
    destinationCountry: 'KR', passportNationality: 'VN', residenceCountry: 'VN', visaCategory: 'Tourist',
  }, '2026-10-01');
  assert.deepEqual(result.claims.map((item) => item.claim_id), ['claim-1']);
  assert.equal(result.hasConflicts, false);
});

test('applies wildcard applicability and sorts country/nationality specific claims first', () => {
  const data = { claims: [
    claim({ claim_id: 'broad', destination_country: '', passport_nationality: '', residence_country: '', visa_category: '' }),
    claim({ claim_id: 'exact' }),
  ] };
  const result = retrieveApprovedClaims(data, {
    destinationCountry: 'KR', passportNationality: 'VN', residenceCountry: 'VN', visaCategory: 'Tourist visa',
  }, '2026-10-01');
  assert.deepEqual(result.claims.map((item) => item.claim_id), ['exact', 'broad']);
});

test('returns applicable conflicts and detects stale verification', () => {
  const data = { claims: [claim(), claim({ claim_id: 'other', claim_text: 'Official visa fee is KRW 200.' })] };
  const result = retrieveApprovedClaims(data, {
    destinationCountry: 'KR', passportNationality: 'VN', residenceCountry: 'VN', visaCategory: 'Tourist visa',
  }, '2026-10-01');
  assert.equal(result.hasConflicts, true);
  assert.equal(isStaleKnowledge(claim({ last_verified_at: '2026-01-01T00:00:00Z' }), '2026-10-01'), true);
  assert.equal(isStaleKnowledge(claim(), '2026-10-01'), false);
});

test('detects contradictions across broad and specific scopes without flagging separate requirements', () => {
  const profile = { destinationCountry: 'KR', passportNationality: 'VN', residenceCountry: 'VN', visaCategory: 'Tourist visa' };
  const conflict = retrieveApprovedClaims({ claims: [
    claim({ claim_id: 'broad', residence_country: '', claim_text: 'The visa fee is KRW 100.' }),
    claim({ claim_id: 'specific', claim_text: 'The visa fee is KRW 200.' }),
  ] }, profile, '2026-10-01');
  assert.equal(conflict.hasConflicts, true);

  const separate = retrieveApprovedClaims({ claims: [
    claim({ claim_id: 'passport', claim_type: 'required_document', claim_text: 'Applicants must submit a valid passport.' }),
    claim({ claim_id: 'bank', claim_type: 'required_document', claim_text: 'Applicants must submit a recent bank statement.' }),
  ] }, profile, '2026-10-01');
  assert.equal(separate.hasConflicts, false);
});

test('does not return claims if country or passport nationality is missing', () => {
  assert.deepEqual(retrieveApprovedClaims({ claims: [claim()] }, { destinationCountry: 'KR' }, '2026-10-01'), { claims: [], hasConflicts: false });
});
