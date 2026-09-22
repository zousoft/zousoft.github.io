// Deep Ocean vault reader (version-3 vaults), for the browser and for tests in Node. Read-only: nothing is
// stored or written anywhere, everything is decrypted in memory as it is shown. The app's formats:
//   - vault name:  "3_" + base32(salt 16 bytes) + base32(tag 8 bytes), RFC 4648 lowercase   (crypto/argon2_kdf.dart)
//   - key:         Argon2id(password, salt; 64 MiB, 3 passes, 1 lane) = 64 bytes: [0,8) tag, [32,64) data key
//   - database:    <vault>.db, table file_info(fileID, parentDir, info, inDirIdx); info = "c3:" + base64(nonce12 | ct | tag16)
//   - files:       64-byte header "ZSDO,2,...", then [uint32 LE length][nonce12 | ciphertext | tag16] per 1 MB
// The crypto functions are passed in, so the same code runs in the browser (CDN modules) and in Node (tests).

const HDR_LEN = 64;
export const RECORD_PLAIN = 1024 * 1024; //one record holds this much plaintext
export const RECORD_OVERHEAD = 4 + 12 + 16; //length, nonce, tag
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32(bytes) {
  let out = '', buffer = 0, bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

function unbase32(text, length) {
  const out = [];
  let buffer = 0, bits = 0;
  for (const c of text) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) return null;
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  return out.length === length ? Uint8Array.from(out) : null;
}

/** { version: 3, salt } for a version-3 vault name; { version: 1 } for an old-style one; { version: 0 } otherwise. */
export function parseVaultName(name) {
  if (/^[0-9a-f]{16}$/.test(name)) return { version: 1 };
  if (/^3_[a-z2-7]{39}$/.test(name)) {
    const enc = name.substring(2, 28);
    const salt = unbase32(enc, 16);
    if (salt && base32(salt) === enc) return { version: 3, salt };
  }
  return { version: 0 };
}

export class VaultReader {
  /**
   * @param crypto { argon2id(pwd, salt) -> Promise<Uint8Array(64)>,
   *                 chachaDecrypt(key, nonce, ctAndTag) -> Uint8Array }
   */
  constructor(crypto) {
    this.crypto = crypto;
  }

  /**
   * The vault among [names] that [pwd] opens: { name, key }, or null. One Argon2id run per vault; [onTry] is
   * called with each name as it goes, so a page can show progress.
   */
  async findVault(pwd, names, onTry) {
    for (const name of names) {
      const { version, salt } = parseVaultName(name);
      if (version !== 3) continue;
      onTry?.(name);
      const out = await this.crypto.argon2id(pwd, salt);
      if ('3_' + base32(salt) + base32(out.subarray(0, 8)) === name) return { name, key: out.slice(32, 64) };
    }
    return null;
  }

  /** A database value: "c3:" + base64(nonce | ciphertext | tag). */
  decryptText(value, key) {
    if (!value.startsWith('c3:')) throw new Error('not a version-3 value');
    const raw = Uint8Array.from(atob(value.substring(3)), c => c.charCodeAt(0));
    return new TextDecoder().decode(this.crypto.chachaDecrypt(key, raw.subarray(0, 12), raw.subarray(12)));
  }

  /** An item's metadata (name, type, size, thumbnail...) from its info value. */
  decryptInfo(value, key) {
    return JSON.parse(this.decryptText(value, key));
  }

  /**
   * Decrypts a vault file ([blob]: a Blob or File, read in pieces), calling onChunk(plaintext) per record.
   * Throws on a wrong key or a changed byte (each record's tag is checked).
   */
  async decryptFile(blob, key, onChunk) {
    const read = async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer());
    const header = new TextDecoder().decode(await read(0, HDR_LEN));
    if (!header.startsWith('ZSDO,2,')) throw new Error('not a version-2 file');
    let pos = HDR_LEN;
    while (pos + 4 <= blob.size) {
      const len = new DataView((await read(pos, pos + 4)).buffer).getUint32(0, true);
      const record = await read(pos + 4, pos + 4 + len);
      if (record.length < len) throw new Error('truncated file');
      onChunk(this.crypto.chachaDecrypt(key, record.subarray(0, 12), record.subarray(12)));
      pos += 4 + len;
    }
  }

  /** The plaintext size of a version-2 file of [encryptedSize] bytes. */
  plainSize(encryptedSize) {
    const body = encryptedSize - HDR_LEN;
    const records = Math.ceil(body / (RECORD_PLAIN + RECORD_OVERHEAD));
    return body - records * RECORD_OVERHEAD;
  }

  /** The plaintext of one record: [index] * RECORD_PLAIN bytes into the file. Used to play a video without
   * holding it in memory. */
  async readRecord(blob, key, index) {
    const at = HDR_LEN + index * (RECORD_PLAIN + RECORD_OVERHEAD);
    if (at + 4 > blob.size) return new Uint8Array(0);
    const raw = new Uint8Array(await blob.slice(at, Math.min(at + 4 + RECORD_PLAIN + RECORD_OVERHEAD, blob.size)).arrayBuffer());
    const len = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0, true);
    if (raw.length < 4 + len) throw new Error('truncated file');
    return this.crypto.chachaDecrypt(key, raw.subarray(4, 16), raw.subarray(16, 4 + len));
  }

  async decryptFileToBytes(blob, key) {
    const parts = [];
    await this.decryptFile(blob, key, c => parts.push(c));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}
