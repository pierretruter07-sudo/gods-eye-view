/**
 * Lightweight JWT implementation using Node.js built-in crypto.
 * Implements jwt.sign, jwt.verify, and jwt.decode compatible with
 * the HS256 algorithm (HMAC-SHA-256).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const ALG = 'HS256';
const HEADER = Buffer.from(JSON.stringify({ alg: ALG, typ: 'JWT' })).toString(
  'base64url',
);

const SECRET = process.env.JWT_SECRET ?? 'gods-eye-view-dev-secret-change-me';

function sign(payload, secret = SECRET, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iat: now,
    exp: now + (options.expiresIn ?? 3600),
    ...payload,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = `${HEADER}.${body}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function decode(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function verify(token, secret = SECRET) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid signature');
  }
  const payload = decode(token);
  if (!payload) throw new Error('Invalid payload');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');
  return payload;
}

export const jwt = { sign, verify, decode };
