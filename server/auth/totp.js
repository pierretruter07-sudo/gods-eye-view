/**
 * TOTP (Time-based One-Time Password) implementation per RFC 6238 / RFC 4226.
 * Uses Node.js built-in crypto — no external packages required.
 *
 * Usage:
 *   import { totp } from './totp.js';
 *   const secret = totp.generateSecret();
 *   const code   = totp.generate(secret);
 *   const valid  = totp.verify(secret, userEnteredCode);
 */
import { createHmac, randomBytes } from 'node:crypto';

const STEP = 30; // seconds per TOTP window
const DIGITS = 6;
const WINDOW = 1; // allow ±1 step drift

/** Base32 alphabet used by authenticator apps. */
const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_CHARS[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const s = str.toUpperCase().replace(/=+$/, '');
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const char of s) {
    const idx = B32_CHARS.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a fresh 20-byte (160-bit) base32-encoded secret. */
function generateSecret() {
  return base32Encode(randomBytes(20));
}

/** Compute the HOTP value for a given counter. */
function hotp(secret, counter) {
  const key = base32Decode(secret);
  // Pack counter as big-endian 8-byte buffer.
  const buf = Buffer.alloc(8);
  const hi = Math.floor(counter / 0x100000000);
  const lo = counter >>> 0;
  buf.writeUInt32BE(hi, 0);
  buf.writeUInt32BE(lo, 4);
  const mac = createHmac('sha1', key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Generate the current TOTP code for a given base32 secret.
 * @param {string} secret - Base32-encoded TOTP secret.
 * @param {number} [timestamp] - Unix epoch ms (defaults to Date.now()).
 * @returns {string} Six-digit TOTP code.
 */
function generate(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / STEP);
  return hotp(secret, counter);
}

/**
 * Verify a TOTP code against a base32 secret, allowing ±WINDOW steps of drift.
 * @param {string} secret - Base32-encoded TOTP secret.
 * @param {string} code   - Six-digit code supplied by the user.
 * @param {number} [timestamp] - Unix epoch ms (defaults to Date.now()).
 * @returns {boolean} True when the code is valid.
 */
function verify(secret, code, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / STEP);
  for (let delta = -WINDOW; delta <= WINDOW; delta++) {
    if (hotp(secret, counter + delta) === String(code).trim()) return true;
  }
  return false;
}

export const totp = { generateSecret, generate, verify };
