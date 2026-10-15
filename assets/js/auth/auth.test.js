import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyCode, isSensitiveRoute, createDeviceId, unlock, lock,
  isAuthenticated, readAuth, SENSITIVE_PREFIXES, DEFAULT_PASSCODE,
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
  assert.deepEqual(SENSITIVE_PREFIXES, ['#/water', '#/health', '#/coffee']);
  assert.equal(isSensitiveRoute('#/health/vaccine'), true);
  assert.equal(isSensitiveRoute('#/coffee/stats'), true);
  assert.equal(isSensitiveRoute('#/water/add'), true);
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

test('unlock persists a device token and lock forgets it', () => {
  assert.equal(isAuthenticated(), false);

  assert.throws(() => unlock('nope'), /Mã khoá không đúng/);
  assert.equal(isAuthenticated(), false);

  const auth = unlock(DEFAULT_PASSCODE);
  assert.equal(auth.isAuthenticated, true);
  assert.ok(auth.deviceId);
  assert.equal(isAuthenticated(), true);
  assert.equal(readAuth().deviceId, auth.deviceId);

  // Re-unlocking keeps the same device id (remembered device).
  const again = unlock(DEFAULT_PASSCODE);
  assert.equal(again.deviceId, auth.deviceId);

  lock();
  assert.equal(isAuthenticated(), false);
  assert.equal(readAuth(), null);
});
