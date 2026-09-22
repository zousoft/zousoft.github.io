// Changing a vault from the page: renaming a folder, a cover picture, moving items and deleting them. It
// writes exactly what the app writes -- the same encrypted rows, the same files on disk -- so a vault stays
// a vault whichever of the two touched it last.
//
// Only Chrome and Edge can do any of this: they are the browsers that hand a page a folder it may write to.
// Everything here needs a FileSystemDirectoryHandle with "readwrite" permission; without one the page stays
// the read-only viewer it was.
//
// Nothing is ADDED here -- no new folders, no newly encrypted photos or videos. Every item a vault holds
// counts against what Premium allows, and Premium lives on the phone, where it was bought; a page (or a PC)
// cannot settle that, so neither adds items. They look after what is already there: rename it, move it,
// give a folder a cover, export a copy, delete it.

const textEncoder = new TextEncoder();

/// A random 32-character hex name, the same shape the app gives a new item (a UUID without its dashes).
export function newId() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/// "c3:" + base64(nonce | ciphertext | tag), what the app's chachaEncryptText writes.
export function encryptText(plain, key, chachaEncrypt) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = chachaEncrypt(key, nonce, textEncoder.encode(plain));
  const all = new Uint8Array(nonce.length + ct.length);
  all.set(nonce);
  all.set(ct, nonce.length);
  let binary = '';
  for (const b of all) binary += String.fromCharCode(b);
  return `c3:${btoa(binary)}`;
}

/// The app's own way of writing a time: "2026-09-19 16:49:02.123456".
export function appTime(date) {
  const two = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ` +
    `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.` +
    `${String(date.getMilliseconds()).padStart(3, '0')}000`;
}

/// Everything a vault's item row holds, as the app writes it.
export function infoOf(meta) {
  return {
    origFileName: meta.origFileName ?? '',
    fileType: meta.fileType ?? 'na',
    createTime: meta.createTime ?? appTime(new Date()),
    fileSize: meta.fileSize ?? 0,
    picH: meta.picH ?? 0,
    picW: meta.picW ?? 0,
    thumbnail: meta.thumbnail ?? '',
    videoDurationMs: meta.videoDurationMs ?? 0,
    inDirIdx: meta.inDirIdx ?? 0,
  };
}

/// Changes a vault, keeping what is on disk and what the database says in step.
///
/// Every change re-reads the database from the folder first and writes it back at the end, so a change
/// made in the app between two changes here is not thrown away. The app can still overwrite a change made
/// here while it holds the same vault open -- there is no lock two programs can share -- so the page says
/// so when a vault is opened for writing.
export class VaultEditor {
  /// folder: the chosen data folder (handle, files, dataRoot). vault: { name, key }.
  /// reader: the VaultReader, for decrypting rows. sql: the sql.js module. crypto: the page's ciphers.
  constructor({ folder, vault, reader, sql, chachaEncrypt }) {
    this.folder = folder;
    this.vault = vault;
    this.reader = reader;
    this.sql = sql;
    this.chachaEncrypt = chachaEncrypt;
  }

  /// The directory handle of the vault itself, or of a folder inside it (by the chain of folder ids).
  async dirHandle(chain = []) {
    let dir = this.folder.handle;
    for (const part of [...this.folder.dataRoot.split('/').slice(1), this.vault.name, ...chain]) {
      dir = await dir.getDirectoryHandle(part);
    }
    return dir;
  }

  async dbHandle() {
    const dir = await this.dirHandle([]);
    const parent = await this.parentOfVault();
    return parent.getFileHandle(`${this.vault.name}.db`, { create: false }).catch(() => dir.getFileHandle(`${this.vault.name}.db`));
  }

  async parentOfVault() {
    let dir = this.folder.handle;
    for (const part of this.folder.dataRoot.split('/').slice(1)) dir = await dir.getDirectoryHandle(part);
    return dir;
  }

  /// Opens the database as it is on disk now, hands it to [work], and writes it back if that succeeded.
  async withDb(work) {
    const handle = await this.dbHandle();
    const db = new this.sql.Database(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
    try {
      const result = await work(db);
      const bytes = db.export();
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return result;
    } finally {
      db.close();
    }
  }

  row(db, id) {
    const got = db.exec('SELECT fileID, parentDir, info, inDirIdx FROM file_info WHERE fileID = ?', [id]);
    const values = got[0]?.values?.[0];
    return values ? { id: values[0], parent: values[1], info: values[2], idx: values[3] } : null;
  }

  meta(info) {
    return this.reader.decryptInfo(info, this.vault.key);
  }

  encrypt(meta) {
    return encryptText(JSON.stringify(infoOf(meta)), this.vault.key, this.chachaEncrypt);
  }

  // ------------------------------------------------------------------------------------- the changes

  nextIndex(db, parentId) {
    const got = db.exec('SELECT MAX(inDirIdx) FROM file_info WHERE parentDir = ?', [parentId]);
    return (got[0]?.values?.[0]?.[0] ?? -1) + 1;
  }

  /// Renames an item: only the name inside its encrypted row changes, as in the app.
  async rename(id, name) {
    await this.withDb((db) => {
      const row = this.row(db, id);
      if (!row) throw new Error('gone');
      const meta = this.meta(row.info);
      meta.origFileName = name;
      db.run('UPDATE file_info SET info = ? WHERE fileID = ?', [this.encrypt(meta), id]);
    });
  }

  /// Gives this item's picture to the folder it is in, as the app's "Set as Cover" does.
  async setAsCover(id) {
    await this.withDb((db) => {
      const item = this.row(db, id);
      if (!item) throw new Error('gone');
      const parent = this.row(db, item.parent);
      if (!parent) throw new Error('the vault itself has no cover'); //at the top there is no folder row
      const parentMeta = this.meta(parent.info);
      parentMeta.thumbnail = this.meta(item.info).thumbnail ?? '';
      db.run('UPDATE file_info SET info = ? WHERE fileID = ?', [this.encrypt(parentMeta), parent.id]);
    });
  }

  /// Moves items into the folder shown now: the file on disk first, then its row, one at a time, so the
  /// two never disagree if something fails half way (the app moves them the same way, for the same reason).
  async move(items, toId, fromChain, toChain) {
    const from = await this.dirHandle(fromChain);
    const to = await this.dirHandle(toChain);
    let moved = 0;
    const errors = [];
    for (const item of items) {
      try {
        if (item.isDir) await this.moveDir(from, to, item.id);
        else await this.moveFile(from, to, item.id);
        await this.withDb((db) => {
          db.run('UPDATE file_info SET parentDir = ?, inDirIdx = ? WHERE fileID = ?',
            [toId, this.nextIndex(db, toId), item.id]);
        });
        moved++;
      } catch (e) {
        errors.push(`${item.name ?? item.id}: ${e.message}`);
      }
    }
    return { moved, errors };
  }

  async moveFile(from, to, id) {
    const handle = await from.getFileHandle(id);
    if (handle.move) {
      await handle.move(to, id); //Chrome moves it without reading a byte
      return;
    }
    const writable = await (await to.getFileHandle(id, { create: true })).createWritable();
    await (await handle.getFile()).stream().pipeTo(writable);
    await from.removeEntry(id);
  }

  async moveDir(from, to, id) {
    const source = await from.getDirectoryHandle(id);
    if (source.move) {
      await source.move(to, id);
      return;
    }
    const target = await to.getDirectoryHandle(id, { create: true });
    await this.copyInto(source, target);
    await from.removeEntry(id, { recursive: true });
  }

  async copyInto(source, target) {
    for await (const [name, handle] of source.entries()) {
      if (handle.kind === 'file') {
        const writable = await (await target.getFileHandle(name, { create: true })).createWritable();
        await (await handle.getFile()).stream().pipeTo(writable);
      } else {
        await this.copyInto(handle, await target.getDirectoryHandle(name, { create: true }));
      }
    }
  }

  /// Deletes items for good: the file (or the folder and everything in it) and then its rows.
  /// What went wrong comes back with the count, so a failure cannot look like a success.
  async remove(items, chain) {
    const dir = await this.dirHandle(chain);
    let files = 0;
    let folders = 0;
    const errors = [];
    for (const item of items) {
      try {
        await dir.removeEntry(item.id, { recursive: item.isDir });
      } catch (e) {
        //a file already gone from the disk is not a reason to keep its row
        if (e.name !== 'NotFoundError') {
          errors.push(`${item.name ?? item.id}: ${e.message}`);
          continue;
        }
      }
      try {
        await this.withDb((db) => {
          if (item.isDir) this.removeTree(db, item.id);
          else db.run('DELETE FROM file_info WHERE fileID = ?', [item.id]);
        });
        item.isDir ? folders++ : files++;
      } catch (e) {
        errors.push(`${item.name ?? item.id}: ${e.message}`);
      }
    }
    return { files, folders, errors };
  }

  //a folder's rows go with it, so nothing is left behind that no folder shows
  removeTree(db, id) {
    const children = db.exec('SELECT fileID FROM file_info WHERE parentDir = ?', [id])[0]?.values ?? [];
    for (const [child] of children) this.removeTree(db, child);
    db.run('DELETE FROM file_info WHERE fileID = ?', [id]);
  }
}
