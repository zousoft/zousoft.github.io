// Deep Ocean in a browser. It opens as a calculator, like the app: the folder holding the vaults is chosen from
// the menu, and a vault opens when its password is typed and ⏎ pressed (anything else is simply worked out).
// Read-only. Nothing is stored (no cookies, no web storage) and nothing is copied: files are read from the
// chosen folder as they are shown, and what is decrypted lives only in memory while it is on screen.
import { chacha20poly1305 } from './vendor/noble-ciphers/chacha.js';
import { VaultReader, parseVaultName, RECORD_PLAIN } from './vault.mjs';
import { KEY_ROWS, LETTER_ROWS, resultOf } from './calc.mjs';
import { t, translatePage } from './i18n.mjs';
import { VaultEditor } from './edit.mjs';

const $ = (id) => document.getElementById(id);
const ARGON2 = { memoryKiB: 65536, iterations: 3, parallelism: 1 };

//Argon2id runs in a worker so the page stays alive while a password is checked
const kdf = new Worker('./kdf-worker.mjs', { type: 'module' });
const kdfWaiting = new Map();
let kdfNext = 1;
kdf.onmessage = (e) => {
  const { id, out, error } = e.data;
  const pending = kdfWaiting.get(id);
  kdfWaiting.delete(id);
  error ? pending.reject(new Error(error)) : pending.resolve(out);
};

const reader = new VaultReader({
  argon2id: (password, salt) =>
    new Promise((resolve, reject) => {
      const id = kdfNext++;
      kdfWaiting.set(id, { resolve, reject });
      kdf.postMessage({ id, password, salt, ...ARGON2 });
    }),
  chachaDecrypt: (key, nonce, ct) => chacha20poly1305(key, nonce).decrypt(ct),
});

let files = new Map();   //path -> () => Promise<File>, from the chosen folder
let dataRoot = null;     //the folder the vaults are in
let vault = null;        //{ name, key, rows }
let SQL = null;
let trail = [];          //the folders from the vault's top down to the one on screen
const urls = [];         //object URLs to release when leaving a folder
let videoWorker = null;  //the service worker that streams videos, when the page is hosted

//the same four orders as the app, and the same way round: a mode chosen again flips the direction
const SORTS = [
  { key: 'time', label: 'sort_by_time', of: (m) => m.createTime ?? '' },
  { key: 'size', label: 'sort_by_size', of: (m) => m.fileSize ?? 0 },
  { key: 'type', label: 'sort_by_type', of: (m) => FILE_TYPES.indexOf(m.fileType) },
  { key: 'name', label: 'sort_by_name', of: (m) => m.origFileName ?? '' },
];
const FILE_TYPES = ['na', 'dir', 'pic', 'mov', 'txt', 'pdf']; //the app's own order, so "By Type" agrees
let sortBy = 'time';
let ascending = true;
let showNames = true; //the name over each photo and video
let editor = null;            //changes the vault, where the browser allows a folder to be written to
let openFolder = null;        //the data folder the open vault came from
const picked = new Map();     //id -> item, what a long press or right click has selected
let cutting = null;           //{ items, chain, parent } waiting to be pasted somewhere

//how big a tile is, as the app's "Set Image Size" sets it: the number is the app's itemsPerRow, and on a
//window wide enough to be a desktop the same setting picks a tile WIDTH and the columns follow the window
const SIZES = [
  { label: 'size_smallest', perRow: 5, tile: 130 },
  { label: 'size_small', perRow: 4, tile: 170 },
  { label: 'size_normal', perRow: 3, tile: 220 },
  { label: 'size_big', perRow: 2, tile: 300 },
  { label: 'size_biggest', perRow: 1, tile: 420 },
];
let itemsPerRow = 3; //the app's own default


// ---------------------------------------------------------------------------------------- the menu

function closeMenus() {
  $('menu').hidden = $('sortMenu').hidden = $('sizeMenu').hidden = true;
}

$('menuBtn').onclick = (e) => {
  e.stopPropagation();
  const show = $('menu').hidden;
  closeMenus();
  $('menu').hidden = !show;
};
$('sortBtn').onclick = (e) => {
  e.stopPropagation();
  const show = $('sortMenu').hidden;
  closeMenus();
  $('sortMenu').hidden = !show;
};
$('sizeBtn').onclick = (e) => {
  e.stopPropagation();
  const show = $('sizeMenu').hidden;
  closeMenus();
  $('sizeMenu').hidden = !show;
};
document.addEventListener('click', (e) => {
  if (![$('menu'), $('sortMenu'), $('sizeMenu')].some((m) => m.contains(e.target))) closeMenus();
});

// ----------------------------------------------------------------------------------- the data folders

//Several folders can hold vaults, as the Windows app allows: they are listed in the menu as "Data Folder 1",
//"Data Folder 2" and so on, and a password is tried against the vaults in all of them.
//
//Only WHICH folders were chosen is remembered, as the browser's own handles to them: no vault contents, no
//password, no key. A handle is useless to anyone who has not also been given permission to that folder, and
//the browser still asks the person before the page may read it again. The x on a row drops it.
const REMEMBERED = { db: 'deep-ocean', store: 'folder', key: 'last' };

let folders = [];          //{ label, handle, files, dataRoot, names, note }
const ownerOf = new Map(); //vault name -> the folder it is in

function withStore(mode, work) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(REMEMBERED.db, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(REMEMBERED.store);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = work(db.transaction(REMEMBERED.store, mode).objectStore(REMEMBERED.store));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result);
        db.close();
      };
    };
  });
}

async function rememberFolders() {
  const keep = folders.filter((f) => f.handle).map((f) => ({ handle: f.handle, label: f.label }));
  try {
    if (keep.length) await withStore('readwrite', (store) => store.put({ folders: keep }, REMEMBERED.key));
    else await withStore('readwrite', (store) => store.delete(REMEMBERED.key));
  } catch {
    //remembering is a convenience: a browser that refuses simply asks for the folders each time
  }
}

async function loadRemembered() {
  try {
    //do not create the store just to look: a page where nothing was ever remembered stores nothing at all
    const existing = await indexedDB.databases?.();
    if (existing && !existing.some((d) => d.name === REMEMBERED.db)) return;
    const saved = await withStore('readonly', (store) => store.get(REMEMBERED.key));
    for (const { handle, label } of saved?.folders ?? []) {
      folders.push({ label: label ?? handle.name, handle, files: new Map(), dataRoot: null, names: [], note: '' });
    }
    showFolders();
    for (const folder of folders) {
      //one folder that cannot be read must not take the others with it
      try {
        await readFolder(folder, false); //only where the browser still allows it
      } catch (e) {
        folder.note = t('data_loc_missing');
      }
    }
    indexFolders();
  } catch {
    folders = [];
  }
}

/// Reads one folder's files. The browser may want to ask first, which it only allows from a click.
async function readFolder(folder, fromClick) {
  if (folder.handle) {
    //writing is asked for, reading is settled for: a folder the browser only lets us read still opens
    const ask = { mode: 'readwrite' };
    let state = (await folder.handle.queryPermission?.(ask)) ?? 'granted';
    if (state === 'prompt' && fromClick) state = await folder.handle.requestPermission(ask);
    folder.writable = state === 'granted';
    if (!folder.writable) state = (await folder.handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (state !== 'granted') {
      folder.note = t('folder_needs_permission');
      showFolders();
      return false;
    }
    folder.files = new Map();
    try {
      await collectFromHandle(folder, folder.handle, folder.handle.name);
    } catch (e) {
      //a folder that is not there any more (an unplugged drive): it stays listed, and says so
      folder.note = t('data_loc_missing');
      folder.names = [];
      showFolders();
      return false;
    }
  }
  indexFolder(folder);
  await readWhere(folder);
  return true;
}

//A browser is never told where a folder is on the disk -- only the folder's own name. The app writes its
//path into a ".location" file inside each data folder, so if this folder has been used by the app since,
//that is where it is; otherwise the folder's name is all anyone here can know.
async function readWhere(folder) {
  const note = folder.dataRoot === null ? null : folder.files.get(`${folder.dataRoot}/location.txt`);
  if (!note) return;
  try {
    const path = (await (await note()).text()).trim();
    if (path) {
      folder.path = path;
      showFolders();
    }
  } catch {
    //unreadable: the folder's name stays
  }
}

//the folder may be encrypted_data itself, or any folder above it: find the one holding vault databases
function findDataRoot(folder) {
  for (const path of folder.files.keys()) {
    if (!path.endsWith('.db')) continue;
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (parseVaultName(path.substring(dir.length + 1, path.length - 3)).version !== 0) return dir;
  }
  return null;
}

/// What this folder holds, ready for a password to be tried against it.
function indexFolder(folder) {
  folder.dataRoot = findDataRoot(folder);
  folder.names = folder.dataRoot === null ? [] : [...new Set([...folder.files.keys()]
    .filter((p) => p.startsWith(`${folder.dataRoot}/`) && p.endsWith('.db'))
    .map((p) => p.substring(folder.dataRoot.length + 1, p.length - 3)))];
  const old = folder.names.filter((n) => parseVaultName(n).version !== 3).length;
  folder.note = folder.names.length === 0
    ? t('folder_empty')
    : (folder.names.length === 1 ? t('data_loc_one_vault') : t('data_loc_vaults', { count: folder.names.length })) +
      (old ? (old === 1 ? t('folder_one_old_vault') : t('folder_old_vaults', { n: old })) : '');
  indexFolders();
}

/// The menu's list: "Data Folder 1: encrypted_data", what is in it, and an x to drop it.
function showFolders() {
  //the folders belong to the calculator, the way out belongs to the vault
  $('pickItem').hidden = vault !== null;
  $('exitItem').hidden = vault === null;
  $('folderList').replaceChildren(...folders.map((folder, index) => {
    const row = document.createElement('div');
    row.className = 'item folderRow';
    row.dataset.folder = String(index);
    row.append(Object.assign(document.createElement('span'), { textContent: '📁' }));
    const what = document.createElement('span');
    what.className = 'what';
    what.append(
      Object.assign(document.createElement('div'),
        { textContent: t('data_loc_n', { n: index + 1, label: folder.path ?? folder.label }) }),
      Object.assign(document.createElement('div'), { className: 'sub', textContent: folder.note }),
    );
    const drop = document.createElement('button');
    drop.className = 'icon drop';
    drop.title = t('data_loc_remove');
    drop.innerHTML = '&times;';
    drop.onclick = async (e) => {
      e.stopPropagation();
      folders.splice(index, 1);
      await rememberFolders();
      indexFolders();
    };
    row.append(what, drop);
    row.onclick = async () => {
      if (await readFolder(folder, true)) {
        $('foldersDlg').close();
        $('pwd').focus();
      }
    };
    return row;
  }));
}

//after a folder comes or goes, which vault is in which folder is known again
function indexFolders() {
  ownerOf.clear();
  for (const f of folders) for (const name of f.names) ownerOf.set(name, f);
  showFolders();
}

function addFolder(folder) {
  if (folders.some((f) => f.label === folder.label)) return false; //already listed
  folders.push(folder);
  return true;
}


// ---------------------------------------------------------------------------------------- choosing a folder

async function collectFromHandle(folder, dir, prefix) {
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'file') folder.files.set(path, () => handle.getFile());
    else await collectFromHandle(folder, handle, path);
  }
}

$('pickItem').onclick = () => {
  closeMenus();
  //nothing to open yet: whoever this is has not used the page before, and should hear this first
  if (folders.length === 0) {
    $('trustDlg').showModal();
    return; //the folders come next, once they have read it
  }
  $('foldersDlg').showModal();
};

// ------------------------------------------------------------- what a page cannot promise, said plainly

//the download starts on its own; the dialog has said what it had to say, so it goes
$('trustApp').onclick = () => $('trustDlg').close();

$('trustGoOn').onclick = () => {
  $('trustDlg').close();
  $('foldersDlg').showModal();
};


$('foldersClose').onclick = () => {
  $('foldersDlg').close();
  keepCaret();
};
$('foldersDlg').onclick = (e) => {
  if (e.target === $('foldersDlg')) $('foldersDlg').close();
};

//and the vault's own way out, as the app's drawer has it
$('exitItem').onclick = () => {
  closeMenus();
  closeVault();
};

$('addFolderBtn').onclick = async () => {
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'deep-ocean-data' });
      const folder =
        { label: dir.name, handle: dir, files: new Map(), dataRoot: null, names: [], note: t('folder_reading') };
      if (!addFolder(folder)) return;
      showFolders();
      await readFolder(folder, true);
      await rememberFolders(); //so it does not have to be found again next time
      $('pwd').focus();
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message);
    }
  } else {
    $('pickInput').click(); //Firefox and Safari: the plain folder picker
  }
};

$('pickInput').onchange = async () => {
  const chosen = [...$('pickInput').files];
  if (chosen.length === 0) return;
  const label = chosen[0].webkitRelativePath.split('/')[0];
  const folder = { label, handle: null, files: new Map(), dataRoot: null, names: [], note: '' };
  if (!addFolder(folder)) return;
  for (const f of chosen) folder.files.set(f.webkitRelativePath, async () => f);
  indexFolder(folder); //this browser cannot remember a folder, so it is only listed for now
  await readWhere(folder);
  $('pwd').focus();
};

$('namesItem').onclick = (e) => {
  e.stopPropagation();
  showNames = !showNames;
  $('namesMark').innerHTML = showNames ? '&#10003;' : '&nbsp;';
  document.body.classList.toggle('no-labels', !showNames);
};

$('aboutItem').onclick = () => {
  closeMenus();
  //the calculator's About is who this is and which version; a vault's also says what the page does with it
  const say = vault === null ? [] : ['about_what', 'about_nothing_leaves', 'about_nothing_written',
    'about_web_remembers', 'about_password', 'about_adds_nothing'];
  $('aboutBody').replaceChildren(...say.map((key) => {
    const p = document.createElement('p');
    p.innerHTML = t(key);
    return p;
  }));
  $('about').showModal();
};
$('aboutClose').onclick = () => {
  $('about').close();
  keepCaret();
};
$('about').onclick = (e) => {
  if (e.target === $('about')) $('about').close(); //a click on the backdrop closes it too
};

// ---------------------------------------------------------------------------------- the calculator, and ⏎

const WORDS = { invalid: t('calc_invalid_input'), infinity: t('calc_infinity') }; //the app's own two messages

//the app's keyboard, drawn from the same list of keys; the letters are its second page
let letters = false; //which page is showing
let shift = false;   //and which case its letters type

function drawKeys() {
  $('keys').replaceChildren(...(letters ? LETTER_ROWS : KEY_ROWS).map((row) => {
    const line = document.createElement('div');
    line.className = 'krow';
    for (const key of row) {
      const button = document.createElement('button');
      const upper = key.letter && shift;
      button.innerHTML = upper ? key.label.toUpperCase() : key.label;
      button.className = [
        key.submit ? 'submit' : '',
        key.hi || (key.shift && shift) ? 'hi' : '',
        key.tex ? 'tex' : '',
        key.layout ? 'layout' : '',
        key.shift && shift ? 'on' : '',
      ].join(' ').trim();
      //what this key types now, which for a letter follows the shift key
      if (key.insert !== undefined) button.dataset.k = upper ? key.insert.toUpperCase() : key.insert;
      if (key.action) button.dataset.action = key.action;
      button.onclick = () => pressKey(upper ? { ...key, insert: key.insert.toUpperCase() } : key);
      line.appendChild(button);
    }
    return line;
  }));
}

drawKeys();

function pressKey(key) {
  const field = $('pwd');
  const at = field.selectionStart ?? field.value.length;
  if (key.action === 'submit') return void submit();
  if (key.action === 'layout') {
    letters = !letters;
    drawKeys();
    return void $('pwd').focus();
  }
  if (key.action === 'shift') {
    shift = !shift;
    drawKeys();
    return void $('pwd').focus();
  }
  if (key.action === 'left') field.setSelectionRange(Math.max(0, at - 1), Math.max(0, at - 1));
  else if (key.action === 'right') field.setSelectionRange(Math.min(field.value.length, at + 1), Math.min(field.value.length, at + 1));
  else if (key.action === 'delete') {
    const end = field.selectionEnd ?? at;
    const from = end > at ? at : Math.max(0, at - 1);
    field.value = field.value.substring(0, from) + field.value.substring(end);
    field.setSelectionRange(from, from);
  } else {
    field.value = field.value.substring(0, at) + key.insert + field.value.substring(field.selectionEnd ?? at);
    const after = at + key.insert.length;
    field.setSelectionRange(after, after);
  }
  field.focus();
  showResult();
}

//the result is worked out as the expression is typed, as it is in the app
function showResult() {
  $('result').textContent = resultOf($('pwd').value, WORDS);
}

//The expression always has the caret while the calculator is showing, as the app's field does: come back
//to this window, or click anywhere that is not something else, and typing goes into it.
function keepCaret() {
  if (vault !== null || $('calc').hidden) return;              //a vault is open: the grid has the window
  if (document.querySelector('dialog[open]')) return;          //a dialog is asking something
  if (![$('menu'), $('sortMenu'), $('sizeMenu')].every((m) => m.hidden)) return; //a menu is open
  $('pwd').focus();
}

window.addEventListener('focus', keepCaret);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) keepCaret();
});
document.addEventListener('pointerup', (e) => {
  //anything with its own job keeps the click: buttons, menus, dialogs, tiles
  if (!e.target.closest('button, a, dialog, input, #menu, #sortMenu, #sizeMenu, #ctxMenu, .tile')) keepCaret();
});
for (const area of [$('calcTop'), $('display')]) {
  area.onclick = (e) => {
    if (e.target !== $('acBtn')) $('pwd').focus();
  };
}

$('acBtn').onclick = () => {
  $('pwd').value = '';
  showResult();
  $('pwd').focus();
};
$('pwd').oninput = showResult;
$('pwd').onkeydown = (e) => {
  if (e.key === 'Enter') submit();
};

//A phone carries the calculator's own keys on the page, so the system keyboard is only in the way:
//it hides half of them, and it offers characters the calculator has no key for. inputmode="none"
//keeps it shut in Chrome; a field that takes no typing of its own keeps it shut everywhere else --
//the keys write into it themselves. Anything with a real pointer has a real keyboard, and keeps it.
if (!matchMedia('(any-pointer: fine)').matches) $('pwd').readOnly = true;

//the result is copied when it is tapped, as in the app
$('result').onclick = async () => {
  const result = $('result').textContent;
  if (!result) return;
  try {
    await navigator.clipboard.writeText(result);
    toast(t('calc_copied', { result }));
  } catch {
    //a browser that refuses the clipboard without a gesture it trusts: nothing to say
  }
};

let toastTimer = null;
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 2500);
}

/// ⏎ : what was typed is tried as a vault's password. Anything else is just a sum, and stays one.
async function submit() {
  const typed = $('pwd').value;
  if (!typed || opening) return;
  showResult();
  const all = folders.flatMap((f) => f.names);
  if (all.length) await openVault(typed, all);
}

let opening = false;
async function openVault(password, all) {
  opening = true;
  const started = performance.now();
  let found = null;
  try {
    found = await reader.findVault(password, all);
  } catch {
    found = null;
  }
  opening = false;
  if (!found) return; //a wrong password says nothing: this is a calculator

  //a vault can be in any of the chosen folders: read it from the one that holds it
  const folder = ownerOf.get(found.name);
  openFolder = folder;
  files = folder.files;
  dataRoot = folder.dataRoot;

  SQL ??= await initSqlJs({ locateFile: (f) => `./vendor/sqljs/${f}` });
  const db = new SQL.Database(new Uint8Array(await (await files.get(`${dataRoot}/${found.name}.db`)()).arrayBuffer()));
  const rows = db.exec('SELECT fileID, parentDir, info FROM file_info ORDER BY inDirIdx')[0]?.values ?? [];
  db.close();
  byId = null;
  vault = { name: found.name, key: found.key, rows: rows.map(([id, parent, info]) => ({ id, parent, info })) };
  editor = folder.writable
    ? new VaultEditor({ folder, vault, reader, sql: SQL, chachaEncrypt: (key, nonce, plain) => chacha20poly1305(key, nonce).encrypt(plain) })
    : null;
  picked.clear();
  cutting = null;
  //two programs cannot lock one vault against each other, so say it once, plainly
  if (editor !== null) toast(t('writing_warning'));
  $('pwd').value = '';
  $('result').textContent = '';
  //which folder this vault came from, in the banner: as much of the path as a browser is allowed to know
  $('title').textContent = `${t('vault_title')} (${folder.path ?? folder.dataRoot})`;
  $('where').textContent = t('opened_in', { ms: Math.round(performance.now() - started) });
  $('calc').hidden = true;
  $('vaultCard').hidden = $('sortBtn').hidden = $('sizeBtn').hidden = false;
  applyTileSize();
  $('namesItem').hidden = false; //a vault setting, so it belongs to the vault's menu only
  showFolders(); //and the locations are the calculator's, so they go
  showFolder([{ id: vault.name, name: t('path_row_root') }]);
}

/// Back to the calculator, the vault closed and its key gone.
function closeVault() {
  vault = null;
  editor = null;
  picked.clear();
  cutting = null;
  hideCtxMenu();
  releaseUrls();
  $('grid').replaceChildren();
  $('vaultCard').hidden = $('sortBtn').hidden = $('sizeBtn').hidden = $('namesItem').hidden = true;
  $('bottomBar').hidden = true;
  $('calc').hidden = false;
  showResult();
  showFolders();
  $('title').textContent = t('calc_title');
  $('where').textContent = '';
}

// ---------------------------------------------------------------------------------------- sorting

function buildSortMenu() {
  $('sortMenu').replaceChildren(...SORTS.map((s) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.sort = s.key;
    const mark = document.createElement('span');
    mark.textContent = sortBy === s.key ? (ascending ? '↑' : '↓') : ' ';
    item.append(mark, Object.assign(document.createElement('span'), { className: 'what', textContent: t(s.label) }));
    item.onclick = (e) => {
      e.stopPropagation();
      if (sortBy === s.key) ascending = !ascending; //the app's way: the same order again turns it round
      else {
        sortBy = s.key;
        ascending = true;
      }
      closeMenus();
      buildSortMenu();
      if (vault) showFolder(trail);
    };
    return item;
  }));
}

function buildSizeMenu() {
  $('sizeMenu').replaceChildren(...SIZES.map((size) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.size = String(size.perRow);
    const mark = document.createElement('span');
    mark.innerHTML = itemsPerRow === size.perRow ? '&#10003;' : '&nbsp;';
    item.append(mark, Object.assign(document.createElement('span'), { className: 'what', textContent: t(size.label) }));
    item.onclick = (e) => {
      e.stopPropagation();
      itemsPerRow = size.perRow;
      closeMenus();
      buildSizeMenu();
      applyTileSize();
    };
    return item;
  }));
}

//a phone takes the setting literally; a desktop window keeps the tile size and fits what it can
function applyTileSize() {
  const size = SIZES.find((s) => s.perRow === itemsPerRow);
  $('grid').style.gridTemplateColumns = window.innerWidth < 600
    ? `repeat(${size.perRow}, 1fr)`
    : `repeat(auto-fill, minmax(${size.tile}px, 1fr))`;
}
window.addEventListener('resize', applyTileSize);

let shownItems = []; //what the folder shows now, for Select All and the menu

function sortItems(entries) {
  const of = SORTS.find((s) => s.key === sortBy).of;
  const direction = ascending ? 1 : -1;
  return entries.sort((a, b) => {
    const x = of(a.meta), y = of(b.meta);
    return (x < y ? -1 : x > y ? 1 : 0) * direction;
  });
}

// ------------------------------------------------------------------------- selecting, and the item menu

//The app's own menu: a long press, or a right click, on an item (or on the empty space below them).
//What it offers follows the app -- rename a folder, a cover picture for a single file, cut and paste,
//file info, decrypt, delete -- minus what only the app can do (sharing, and restoring to a path).
function ctxItem(label, icon, action, ok = true) {
  if (!ok) return null;
  const row = document.createElement('div');
  row.className = 'item';
  row.dataset.action = action;
  row.append(Object.assign(document.createElement('span'), { textContent: icon }),
    Object.assign(document.createElement('span'), { className: 'what', textContent: t(label) }));
  row.onclick = async (e) => {
    e.stopPropagation();
    hideCtxMenu();
    await runCtxAction(action);
  };
  return row;
}

function showCtxMenu(at, item) {
  if (!vault) return;
  if (item && !picked.has(item.id)) {
    picked.clear(); //a press on an unselected item selects it, as the app does
    picked.set(item.id, item);
  }
  const one = picked.size === 1 ? [...picked.values()][0] : null;
  const writable = editor !== null || canAskToWrite();
  const rows = cutting
    ? [ctxItem('ctx_btn_paste', '\ud83d\udccb', 'paste', writable), ctxItem('ctx_btn_sel_cancel', '✕', 'cancel')]
    : [
      ctxItem('ctx_btn_sel_all', '\u2611', 'selectAll'),
      ctxItem('ctx_btn_sel_none', '\u2610', 'selectNone'),
      ctxItem('ctx_btn_rename', '\u270f', 'rename', writable && one !== null && one.isDir),
      ctxItem('ctx_btn_set_as_cover', '\ud83e\ude9f', 'cover', writable && one !== null && !one.isDir && trail.length > 1),
      ctxItem('ctx_btn_cut', '\u2702', 'cut', writable && picked.size > 0),
      ctxItem('ctx_btn_file_info', '\u24d8', 'info', one !== null && !one.isDir),
      ctxItem('vault_btn_decrypt', '\ud83d\udd13', 'decrypt', picked.size > 0),
      ctxItem('vault_btn_delete', '\ud83d\uddd1', 'delete', writable && picked.size > 0),
      ctxItem('ctx_btn_sel_cancel', '✕', 'cancel'),
    ];
  const menu = $('ctxMenu');
  menu.replaceChildren(...rows.filter(Boolean));
  menu.hidden = false;
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(at.x, window.innerWidth - box.width - 8)}px`;
  menu.style.top = `${Math.min(at.y, window.innerHeight - box.height - 8)}px`;
  showFolder(trail);
}

function hideCtxMenu() {
  $('ctxMenu').hidden = true;
}
document.addEventListener('click', (e) => {
  if (!$('ctxMenu').hidden && !$('ctxMenu').contains(e.target)) hideCtxMenu();
});

const CHANGES = ['rename', 'cover', 'paste', 'delete'];

async function runCtxAction(action) {
  if (CHANGES.includes(action) && !(await ensureWritable())) return;
  const items = [...picked.values()];
  const one = items[0];
  const chain = trail.slice(1).map((f) => f.id);
  const here = trail[trail.length - 1];
  try {
    if (action === 'cancel') {
      picked.clear();
      cutting = null; //a cut waiting to be pasted is given up too, as it is in the app
    } else if (action === 'selectAll') {
      for (const item of shownItems) picked.set(item.id, item);
    } else if (action === 'selectNone') {
      picked.clear();
    } else if (action === 'rename') {
      const name = await askForText(t('rename_dlg_title', { oldName: one.name }), t('rename_dlg_type_new_name'), one.name);
      if (!name || name === one.name) return;
      await editor.rename(one.id, name);
      picked.clear();
      await reloadVault();
    } else if (action === 'cover') {
      await editor.setAsCover(one.id);
      picked.clear();
      await reloadVault();
    } else if (action === 'cut') {
      cutting = { items, chain };
      picked.clear();
    } else if (action === 'paste') {
      const { moved, errors } = await editor.move(cutting.items, here.id, cutting.chain, chain);
      cutting = null;
      toast(errors.length ? errors[0] : t('moved', { n: moved }));
      if (errors.length) console.error('move:', errors);
      await reloadVault();
    } else if (action === 'info') {
      await showFileInfo(one);
      return;
    } else if (action === 'decrypt') {
      await decryptToDisk(items);
      picked.clear();
    } else if (action === 'delete') {
      const yes = await askYesNo(t('common_confirm'), t('vault_to_del_confirm_msg', { itemCount: items.length }));
      if (!yes) return;
      const gone = await editor.remove(items, chain);
      picked.clear();
      //what failed is said out loud: a delete that did nothing must not look like one that worked
      if (gone.errors.length) console.error('delete:', gone.errors);
      toast(gone.errors.length
        ? `${t('delete_failed')} ${gone.errors[0]}`
        : t('vault_del_success', { deletedFileCnt: gone.files, deletedFolderCnt: gone.folders }));
      await reloadVault();
    }
  } catch (e) {
    toast(e.message);
  }
  showFolder(trail);
}

/// Reads the vault's rows again after a change, and shows the folder as it now is.
async function reloadVault() {
  const folder = ownerOf.get(vault.name);
  const bytes = new Uint8Array(await (await files.get(`${dataRoot}/${vault.name}.db`)()).arrayBuffer());
  const db = new SQL.Database(bytes);
  const rows = db.exec('SELECT fileID, parentDir, info FROM file_info ORDER BY inDirIdx')[0]?.values ?? [];
  db.close();
  vault.rows = rows.map(([id, parent, info]) => ({ id, parent, info }));
  //a new folder is a new directory on disk: the page's list of files has to know about it
  if (folder?.handle) {
    folder.files = new Map();
    await collectFromHandle(folder, folder.handle, folder.handle.name);
    files = folder.files;
    byId = null;
  }
  showFolder(trail);
}

//the same buttons the app puts along the bottom of a vault
$('btnRefresh').onclick = () => reloadVault();
$('btnDecrypt').onclick = async () => {
  if (picked.size === 0) return void nothingPicked(t('vault_btn_decrypt'));
  await runCtxAction('decrypt');
};
$('btnDelete').onclick = async () => {
  if (picked.size === 0) return void nothingPicked(t('vault_btn_delete'));
  await runCtxAction('delete');
};

//the app says the same thing when a button is pressed with nothing selected
function nothingPicked(title) {
  openAsk(title, asText(t('vault_to_del_items_hint')), { okOnly: true });
}

//what can be pressed depends on the folder, as it does in the app
function updateBottomBar() {
  $('bottomBar').hidden = vault === null;
  $('btnDelete').disabled = editor === null && !canAskToWrite();
  $('btnDelete').title = editor !== null || canAskToWrite() ? '' : t('write_not_supported');
}

//this browser could write to this folder, if the person allows it
function canAskToWrite() {
  return openFolder?.handle !== undefined && openFolder?.handle !== null && vault !== null;
}

/// Asks the browser for permission to change the folder, which it only allows from a click.
/// A folder remembered from a past visit always comes back needing this.
async function ensureWritable() {
  if (editor !== null) return true;
  if (!canAskToWrite()) {
    toast(t('write_not_supported'));
    return false;
  }
  const state = await openFolder.handle.requestPermission({ mode: 'readwrite' });
  if (state !== 'granted') {
    toast(t('write_permission'));
    return false;
  }
  openFolder.writable = true;
  editor = new VaultEditor({
    folder: openFolder, vault, reader, sql: SQL,
    chachaEncrypt: (key, nonce, plain) => chacha20poly1305(key, nonce).encrypt(plain),
  });
  toast(t('writing_warning'));
  updateBottomBar();
  return true;
}


// ------------------------------------------------------------------------------- asking, and file info

let askAnswer = null;
function closeAsk(answer) {
  askAnswer?.(answer);
  askAnswer = null;
  $('ask').close();
}
$('askOk').onclick = () => closeAsk($('ask').querySelector('input')?.value ?? true);
$('askCancel').onclick = () => closeAsk(null);
$('ask').addEventListener('cancel', () => closeAsk(null));

function openAsk(title, body, { input = null, okOnly = false } = {}) {
  $('askTitle').textContent = title;
  $('askBody').replaceChildren(body);
  if (input !== null) {
    const field = document.createElement('input');
    field.value = input;
    field.onkeydown = (e) => {
      if (e.key === 'Enter') closeAsk(field.value);
    };
    $('askBody').append(field);
  }
  $('askCancel').hidden = okOnly;
  $('ask').showModal();
  $('ask').querySelector('input')?.select();
  return new Promise((resolve) => (askAnswer = resolve));
}

//a plain message keeps whatever line breaks it has; a dialog built of elements lays itself out
const asText = (message) => Object.assign(document.createElement('div'), { className: 'pre', textContent: message });
const askForText = (title, hint, value) => openAsk(title, asText(hint), { input: value });
const askYesNo = (title, message) => openAsk(title, asText(message));

/// The same facts the app's File Info shows.
async function showFileInfo(item) {
  const meta = item.meta;
  const size = await filePlainSize(item);
  const list = document.createElement('dl');
  const add = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    list.append(Object.assign(document.createElement('dt'), { textContent: t(label) }),
      Object.assign(document.createElement('dd'), { textContent: String(value) }));
  };
  const kind = meta.fileType === 'pic' ? 'file_info_type_image' : meta.fileType === 'mov' ? 'file_info_type_video' : 'file_info_type_other';
  add('file_info_name', item.name);
  add('file_info_type', t(kind));
  add('file_info_size', `${(size / 1048576).toFixed(2)} MB`);
  add('file_info_created', (meta.createTime ?? '').split('.')[0]);
  if (meta.picW && meta.picH) add('file_info_dimensions', `${meta.picW} x ${meta.picH}`);
  if (meta.videoDurationMs) add('file_info_duration', formatTime(meta.videoDurationMs / 1000));
  add('file_info_path', meta.origFileName);
  add('file_info_encryption', t('file_info_enc_v2'));
  await openAsk(t('file_info_title'), list, { okOnly: true });
}

async function filePlainSize(item) {
  try {
    return reader.plainSize((await files.get(item.path)()).size);
  } catch {
    return item.meta.fileSize ?? 0;
  }
}

/// Decrypt: the app writes the plain files to a folder you choose; a page hands them to the browser
/// as downloads (or, where it can, straight into a folder you pick).
async function decryptToDisk(items) {
  for (const item of items) {
    if (item.isDir) continue; //a folder is not a file: the app does not decrypt one either
    const plain = await reader.decryptFileToBytes(await files.get(item.path)(), vault.key);
    const type = item.meta.fileType === 'mov' ? 'video/mp4' : 'image/jpeg';
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({ suggestedName: item.name }).catch(() => null);
      if (!handle) return;
      const writable = await handle.createWritable();
      await writable.write(new Blob([plain], { type }));
      await writable.close();
    } else {
      const url = URL.createObjectURL(new Blob([plain], { type }));
      const link = Object.assign(document.createElement('a'), { href: url, download: item.name });
      link.click();
      URL.revokeObjectURL(url);
    }
    toast(t('downloaded', { name: item.name }));
  }
}

// ---------------------------------------------------------------------------------------- showing a folder

function releaseUrls() {
  while (urls.length) URL.revokeObjectURL(urls.pop());
}

//a vault's folders nest on disk as they do on screen, so the path is the whole chain of folder ids,
//not just the one the item sits in (a file two folders deep lives at <vault>/<dir1>/<dir2>/<id>)
function itemPath(id) {
  const chain = trail.slice(1).map((t) => t.id); //trail[0] is the vault itself
  const path = [dataRoot, vault.name, ...chain, id].join('/');
  return files.has(path) ? path : (byId ??= indexVaultFiles()).get(id) ?? path;
}

//a fallback for a vault laid out differently: where each encrypted name is, wherever it sits
let byId = null;
function indexVaultFiles() {
  const index = new Map();
  const under = `${dataRoot}/${vault.name}/`;
  for (const p of files.keys()) {
    if (p.startsWith(under)) index.set(p.substring(p.lastIndexOf('/') + 1), p);
  }
  return index;
}

//[at]: the folders from the vault's top down to the one on screen
function showFolder(at) {
  trail = at;
  releaseUrls();
  const here = trail[trail.length - 1];
  $('path').replaceChildren(...trail.flatMap((t, i) => {
    const a = document.createElement('a');
    a.textContent = t.name;
    a.onclick = () => showFolder(trail.slice(0, i + 1));
    return i === 0 ? [a] : [Object.assign(document.createElement('span'), { textContent: '/' }), a];
  }));

  //everything in this folder, decrypted enough to be sorted the way the app sorts it
  const entries = [];
  for (const row of vault.rows.filter((r) => r.parent === here.id)) {
    let meta;
    try {
      meta = reader.decryptInfo(row.info, vault.key);
    } catch {
      continue; //a row this password cannot read: not part of this vault
    }
    entries.push({ row, meta });
  }
  sortItems(entries);

  const grid = $('grid');
  grid.replaceChildren();
  shownItems = [];
  const items = []; //the photos and videos, in the order shown, for the viewer's < and >
  for (const { row, meta } of entries) {
    const isDir = meta.fileType === 'dir';
    const name = isDir ? meta.origFileName : meta.origFileName.replaceAll('\\', '/').split('/').pop();
    const tile = document.createElement('div');
    tile.className = isDir ? 'tile dir' : 'tile';
    tile.tabIndex = 0;
    if (isDir) {
      tile.textContent = '📁';
      tile.onclick = () => showFolder([...trail, { id: row.id, name }]);
    } else {
      if (meta.thumbnail) {
        const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(meta.thumbnail), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }));
        urls.push(url);
        tile.appendChild(Object.assign(document.createElement('img'), { src: url, alt: name, loading: 'lazy' }));
      }
      if (meta.fileType === 'mov') {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = `▶ ${formatTime((meta.videoDurationMs ?? 0) / 1000)}`;
        tile.appendChild(badge);
      }
      const index = items.length;
      items.push({ meta, name, path: itemPath(row.id) });
      tile.onclick = () => openItem(items, index);
    }
    tile.appendChild(Object.assign(document.createElement('div'), { className: 'label', textContent: name }));
    tile.onkeydown = (e) => {
      if (e.key === 'Enter') tile.click();
    };

    //what a press acts on: the same item the app's menu would act on
    const entry = { id: row.id, name, isDir, meta, path: isDir ? null : itemPath(row.id) };
    shownItems.push(entry);
    if (picked.has(row.id)) {
      tile.classList.add('picked');
      tile.append(Object.assign(document.createElement('span'), { className: 'tick', textContent: '\u2713' }));
    }
    if (cutting?.items.some((i) => i.id === row.id)) tile.classList.add('cut');
    if (picked.size > 0) {
      //while something is selected a tap picks and unpicks, as it does in the app
      tile.onclick = () => {
        picked.has(row.id) ? picked.delete(row.id) : picked.set(row.id, entry);
        showFolder(trail);
      };
    }
    tile.oncontextmenu = (e) => {
      e.preventDefault();
      showCtxMenu({ x: e.clientX, y: e.clientY }, entry);
    };
    let pressTimer = null;
    tile.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      pressTimer = setTimeout(() => showCtxMenu({ x: touch.clientX, y: touch.clientY }, entry), 500);
    }, { passive: true });
    for (const end of ['touchend', 'touchmove', 'touchcancel']) {
      tile.addEventListener(end, () => clearTimeout(pressTimer), { passive: true });
    }
    grid.appendChild(tile);
  }
  $('count').textContent =
    grid.childElementCount ? t('items', { n: grid.childElementCount }) : t('empty');
  updateBottomBar();
  $('vaultCard').oncontextmenu = (e) => {
    if (e.target.closest('.tile')) return; //the tile has its own
    e.preventDefault();
    showCtxMenu({ x: e.clientX, y: e.clientY }, null);
  };
}

// ---------------------------------------------------------------------------------------- one photo or video

let viewerUrl = null;
let viewerItems = [];
let viewerAt = 0;

async function openItem(items, index) {
  viewerItems = items;
  viewerAt = index;
  await showViewerItem();
}

//the edge arrows go grey at the first and the last item
function updateEdges() {
  $('prevBtn').disabled = viewerAt <= 0;
  $('nextBtn').disabled = viewerAt >= viewerItems.length - 1;
}

async function showViewerItem() {
  const { meta, name, path } = viewerItems[viewerAt];
  $('viewer').classList.add('open');
  $('viewerBody').replaceChildren();
  releaseViewerUrl();
  updateEdges();
  $('viewerName').textContent = name;
  $('viewerInfo').textContent = t('decrypting');
  const started = performance.now();
  try {
    const read = files.get(path);
    if (!read) throw new Error('this file is not in the chosen folder');
    const blob = await read();
    if (meta.fileType === 'mov' && videoWorker) {
      //hosted: the video is streamed, decrypted piece by piece as it plays
      const size = reader.plainSize(blob.size);
      videoBlobs.set(path, { blob, key: vault.key });
      const video = document.createElement('video');
      video.id = 'viewerMedia';
      video.controls = video.autoplay = true;
      //relative: the page may be served from a path of its own, not only from a site's root
      video.src = `./__vault_video__/${encodeURIComponent(path)}?size=${size}`;
      $('viewerBody').appendChild(video);
      $('viewerInfo').textContent = t('played_from_folder', { mb: (size / 1048576).toFixed(1) });
      return;
    }
    const plain = await reader.decryptFileToBytes(blob, vault.key);
    viewerUrl = URL.createObjectURL(new Blob([plain], { type: meta.fileType === 'mov' ? 'video/mp4' : 'image/jpeg' }));
    const el = document.createElement(meta.fileType === 'mov' ? 'video' : 'img');
    el.id = 'viewerMedia';
    el.src = viewerUrl;
    if (meta.fileType === 'mov') el.controls = el.autoplay = true;
    else el.alt = name;
    $('viewerBody').appendChild(el);
    $('viewerInfo').textContent = t('decrypted_in_memory',
      { mb: (plain.length / 1048576).toFixed(1), ms: Math.round(performance.now() - started) });
  } catch (e) {
    say('viewerInfo', t('could_not_decrypt', { name, error: e.message }), 'err');
  }
}

function releaseViewerUrl() {
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = null;
}

function closeViewer() {
  $('viewer').classList.remove('open');
  $('viewerBody').replaceChildren();
  releaseViewerUrl();
  videoBlobs.clear();
}

$('closeBtn').onclick = closeViewer;
//a tap on the picture goes back to the folder, as it does in the app; a video keeps its own controls
$('viewerBody').onclick = (e) => {
  if (e.target.tagName !== 'VIDEO') closeViewer();
};
$('prevBtn').onclick = () => {
  if (viewerAt > 0) {
    viewerAt--;
    showViewerItem();
  }
};
$('nextBtn').onclick = () => {
  if (viewerAt < viewerItems.length - 1) {
    viewerAt++;
    showViewerItem();
  }
};
document.addEventListener('keydown', (e) => {
  if ($('viewer').classList.contains('open')) {
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowLeft') $('prevBtn').click();
    if (e.key === 'ArrowRight') $('nextBtn').click();
  } else if (e.key === 'Escape' && vault) {
    trail.length > 1 ? showFolder(trail.slice(0, -1)) : closeVault();
  }
});

// ---------------------------------------------------------------------------------------- streaming a video

const videoBlobs = new Map(); //path -> { blob, key } while a video is on screen

async function setupVideoWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return; //a page opened from a file: no worker
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    videoWorker = navigator.serviceWorker.controller ?? (await navigator.serviceWorker.ready).active;
    navigator.serviceWorker.addEventListener('message', onVideoRequest);
  } catch (e) {
    videoWorker = null; //without it, a video is decrypted into memory instead
  }
}

//the worker asks for a range of a video's plaintext; the records around it are decrypted here
async function onVideoRequest(event) {
  const { id, video, start, end } = event.data ?? {};
  if (id === undefined) return;
  const source = videoBlobs.get(decodeURIComponent(video));
  const reply = (message) => event.source.postMessage({ id, ...message });
  if (!source) return reply({ error: 'not open' });
  try {
    const out = new Uint8Array(end - start + 1);
    let at = start;
    while (at <= end) {
      const record = await reader.readRecord(source.blob, source.key, Math.floor(at / RECORD_PLAIN));
      if (record.length === 0) break;
      const from = at % RECORD_PLAIN;
      const take = Math.min(record.length - from, end - at + 1);
      if (take <= 0) break;
      out.set(record.subarray(from, from + take), at - start);
      at += take;
    }
    const bytes = out.subarray(0, at - start);
    reply({ bytes });
  } catch (e) {
    reply({ error: String(e) });
  }
}

// ---------------------------------------------------------------------------------------- bits and pieces

function say(id, text, className = 'sub') {
  const el = $(id);
  el.textContent = text;
  el.className = className;
}

function formatTime(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

translatePage();
$('pwd').focus(); //ready to be typed in from the moment the page opens
buildSortMenu();
buildSizeMenu();
setupVideoWorker();
loadRemembered();
