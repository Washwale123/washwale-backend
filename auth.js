const crypto = require('crypto');
const SECRET = process.env.JWT_SECRET || 'washwale-dev-secret-change-me';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(check));
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signToken(payload, expiresInSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const headerB64 = base64url(JSON.stringify(header));
  const bodyB64 = base64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`${headerB64}.${bodyB64}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${headerB64}.${bodyB64}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(`${headerB64}.${bodyB64}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (sig !== expectedSig) return null;
  const body = JSON.parse(Buffer.from(bodyB64, 'base64').toString('utf-8'));
  if (body.exp && Date.now() / 1000 > body.exp) return null;
  return body;
}

function randomToken(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, randomToken };
