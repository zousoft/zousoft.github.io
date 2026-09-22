// Serves a vault video to the page's <video> element, record by record, so a large video never has to be held
// in memory. The bytes are decrypted by the page (the key never comes here): this worker only asks the page for
// the ranges the player wants, and answers the player's Range requests with them.
//
// Without this (a page opened straight from a file, where a browser allows no worker), the page falls back to
// decrypting a whole video into memory.
//Relative to wherever the page is served from, so the whole thing works just as well under a path
//of its own -- https://example.com/calc/ -- as at the root of a site.
const PREFIX = new URL('./__vault_video__/', self.registration.scope).pathname;

self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

let nextRequest = 1;
const waiting = new Map();

//the page answers with the plaintext of a range
self.addEventListener('message', (e) => {
  const { id, bytes, error } = e.data ?? {};
  const pending = waiting.get(id);
  if (!pending) return;
  waiting.delete(id);
  error ? pending.reject(new Error(error)) : pending.resolve(bytes);
});

function askPage(client, video, start, end) {
  const id = nextRequest++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    client.postMessage({ id, video, start, end });
    setTimeout(() => {
      if (waiting.delete(id)) reject(new Error('the page did not answer'));
    }, 30000);
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  const video = url.pathname.substring(PREFIX.length);
  const size = Number(url.searchParams.get('size') ?? '0');

  event.respondWith((async () => {
    const client = await self.clients.get(event.clientId) ?? (await self.clients.matchAll())[0];
    if (!client || !size) return new Response('gone', { status: 404 });

    const range = event.request.headers.get('range');
    const match = range && /bytes=(\d*)-(\d*)/.exec(range);
    let start = 0, end = size - 1;
    if (match) {
      if (match[1] === '') {
        start = size - Number(match[2]); //"bytes=-N": the last N bytes
      } else {
        start = Number(match[1]);
        if (match[2] !== '') end = Number(match[2]);
      }
    }
    if (end >= size) end = size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    //a player asks for a lot at once; a few MB at a time keeps memory small and the first frames quick
    end = Math.min(end, start + 4 * 1024 * 1024 - 1);

    let bytes;
    try {
      bytes = await askPage(client, video, start, end);
    } catch (e) {
      return new Response(String(e), { status: 500 });
    }
    return new Response(bytes, {
      status: match ? 206 : 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(bytes.byteLength),
        'Accept-Ranges': 'bytes',
        ...(match ? { 'Content-Range': `bytes ${start}-${start + bytes.byteLength - 1}/${size}` } : {}),
      },
    });
  })());
});
