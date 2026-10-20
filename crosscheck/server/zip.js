/**
 * @file A small, dependency-free zip reader for CrossCheck's intake. Reads
 * an archive held in memory (an upload or a GitHub download) and lists its
 * entries; each entry's bytes are inflated only when read. Nothing is
 * written to disk, so a hostile path cannot escape anywhere.
 *
 * Supports stored and deflated entries (what GitHub and every common zip
 * tool produce). Refuses zip64, encrypted entries and archives whose
 * declared sizes exceed the limits (zip-bomb guard).
 * @module crosscheck/server/zip
 */
import { inflateRawSync } from 'node:zlib';

export const ZIP_LIMITS = Object.freeze({
  /** Entries in one archive. */
  maxEntries: 60_000,
  /** Total uncompressed bytes. */
  maxTotalBytes: 600 * 1024 * 1024,
  /** Largest single entry inflated. */
  maxEntryBytes: 32 * 1024 * 1024,
  /** Highest compression ratio accepted for one entry. */
  maxRatio: 200,
});

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

/** A zip error the intake reports to the user as it is. */
export class ZipError extends Error {}

function findEocd(buf) {
  const min = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= min; i -= 1)
    if (buf.readUInt32LE(i) === EOCD) return i;
  throw new ZipError('Not a zip archive (no end-of-archive record)');
}

/**
 * List a zip archive's file entries.
 * @param {Buffer} buf the whole archive
 * @returns {Array<{path: string, size: number, read: () => Buffer}>}
 */
export function readZip(buf, limits = ZIP_LIMITS) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('Not a zip archive');
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('Zip64 archives are not supported');
  if (count > limits.maxEntries) throw new ZipError(`Too many files in the archive (${count})`);
  if (cdOffset + cdSize > buf.length) throw new ZipError('The archive is truncated');
  const entries = [];
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== CEN) throw new ZipError('Damaged archive directory');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // a folder
    if (flags & 0x1) throw new ZipError('Encrypted archives are not supported');
    if (method !== 0 && method !== 8) continue; // unusual compression: listed nowhere
    total += usize;
    if (total > limits.maxTotalBytes) throw new ZipError('The archive is too large once unpacked');
    // Small, very repetitive files compress hugely and are harmless; a
    // bomb is large once unpacked.
    if (usize > 1024 * 1024 && csize > 0 && usize / csize > limits.maxRatio)
      throw new ZipError(`Suspicious compression ratio in ${name}`);
    entries.push({
      path: name,
      size: usize,
      read: () => {
        if (usize > limits.maxEntryBytes) return null;
        if (buf.readUInt32LE(local) !== LOC) throw new ZipError(`Damaged entry ${name}`);
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const data = buf.subarray(start, start + csize);
        const out = method === 0 ? data : inflateRawSync(data, { maxOutputLength: limits.maxEntryBytes });
        return out.length > limits.maxEntryBytes ? null : out;
      },
    });
  }
  return entries;
}
