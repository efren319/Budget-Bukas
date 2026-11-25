const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SCRYPT_PREFIX = '$scrypt$';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

function scryptAsync(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

/**
 * Hash a plaintext password using native Node crypto.scrypt (C++ libuv threadpool).
 * Format: $scrypt$N$r$p$saltHex$hashHex
 * @param {string} plainPassword
 * @returns {Promise<string>}
 */
async function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = await scryptAsync(plainPassword, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024
  });
  return `${SCRYPT_PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored $scrypt$ or legacy bcrypt ($2*$) hash.
 * @param {string} plainPassword
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plainPassword, storedHash) {
  if (typeof plainPassword !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return false;
  }

  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    const parts = storedHash.split('$');
    if (parts.length !== 7) return false;

    const N = Number.parseInt(parts[2], 10);
    const r = Number.parseInt(parts[3], 10);
    const p = Number.parseInt(parts[4], 10);
    const salt = parts[5];
    const hashHex = parts[6];

    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N <= 1 || r <= 0 || p <= 0) {
      return false;
    }
    if (!salt || !hashHex || hashHex.length % 2 !== 0) {
      return false;
    }

    const expectedBuf = Buffer.from(hashHex, 'hex');
    const derivedBuf = await scryptAsync(plainPassword, salt, expectedBuf.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024
    });

    if (derivedBuf.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  }

  return bcrypt.compare(plainPassword, storedHash);
}

/**
 * Return true if the stored hash uses a legacy format that should be transparently upgraded.
 * @param {string} storedHash
 * @returns {boolean}
 */
function needsRehash(storedHash) {
  return typeof storedHash !== 'string' || !storedHash.startsWith(SCRYPT_PREFIX);
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash
};

