// Print the SHA-256 (hex) of a passcode so you can paste only the digest into
// hugo.toml ([params.security].passcodeHash) — the plaintext never gets committed.
//
//   npm run hash -- "Mã khoá của bạn"
//   node scripts/hash-passcode.mjs "Mã khoá của bạn"

import { createHash } from 'node:crypto';

const value = process.argv.slice(2).join(' ');
if (!value) {
  console.error('Usage: npm run hash -- "<mã khoá>"');
  process.exit(1);
}
console.log(createHash('sha256').update(value, 'utf8').digest('hex'));
