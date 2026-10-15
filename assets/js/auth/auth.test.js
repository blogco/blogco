import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyCode, isSensitiveRoute, createDeviceId, unlock, lock,
  isAuthenticated, readAuth, SENSITIVE_PREFIXES, DEFAULT_PASSCODE,
  sha256Hex, verifyHash, normalizeHash,
} from '../auth.js';

// localStorage stub so the browser-only persistence path can run in Node.
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

test('marks only the personal modules as sensitive', () => {
  assert.deepEqual(SENSITIVE_PREFIXES, ['#/water', '#/health', '#/coffee', '#/thuoc']);
  assert.equal(isSensitiveRoute('#/health/vaccine'), true);
  assert.equal(isSensitiveRoute('#/coffee/stats'), true);
  assert.equal(isSensitiveRoute('#/water/add'), true);
  assert.equal(isSensitiveRoute('#/thuoc/stats'), true);
  assert.equal(isSensitiveRoute('#/brand-guidelines'), false);
  assert.equal(isSensitiveRoute(''), false);
});

test('verifyCode matches case-insensitively and rejects blanks', () => {
  assert.equal(verifyCode('123456'), true);
  assert.equal(verifyCode('  123456 '), true);
  assert.equal(verifyCode('BlogCo', 'blogco'), true);
  assert.equal(verifyCode('wrong'), false);
  assert.equal(verifyCode(''), false);
  assert.equal(verifyCode('anything', ''), false);
});

test('createDeviceId produces a stable, unique looking token', () => {
  const a = createDeviceId();
  const b = createDeviceId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length >= 8);
  assert.notEqual(a, b);
});

test('sha256Hex hashes a code so only the digest is stored', async () => {
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(normalizeHash(' ABCD '), 'abcd');
});

test('verifyHash accepts the matching code and rejects others', async () => {
  const secret = 'correct horse battery staple';
  const digest = await sha256Hex(secret);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(await verifyHash(secret, digest), true);
  assert.equal(await verifyHash(` ${secret} `, digest.toUpperCase()), true);
  assert.equal(await verifyHash('wrong-code', digest), false);
  assert.equal(await verifyHash(secret, ''), false);
});

test('unlock persists a device token and lock forgets it', async () => {
  assert.equal(isAuthenticated(), false);

  await assert.rejects(unlock('nope'), /Mã khoá không đúng/);
  assert.equal(isAuthenticated(), false);

  const auth = await unlock(DEFAULT_PASSCODE);
  assert.equal(auth.isAuthenticated, true);
  assert.ok(auth.deviceId);
  assert.equal(isAuthenticated(), true);
  assert.equal(readAuth().deviceId, auth.deviceId);

  // Re-unlocking keeps the same device id (remembered device).
  const again = await unlock(DEFAULT_PASSCODE);
  assert.equal(again.deviceId, auth.deviceId);

  lock();
  assert.equal(isAuthenticated(), false);
  assert.equal(readAuth(), null);
});
