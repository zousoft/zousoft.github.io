// Argon2id off the page's thread: checking a password takes a moment on purpose, and the page must stay alive
// while it runs (and be able to show which vault is being tried).
import { argon2idAsync } from './vendor/noble-hashes/argon2.js';

self.onmessage = async (e) => {
  const { id, password, salt, memoryKiB, iterations, parallelism } = e.data;
  try {
    const out = await argon2idAsync(password, salt, { m: memoryKiB, t: iterations, p: parallelism, dkLen: 64, asyncTick: 20 });
    self.postMessage({ id, out }, [out.buffer]);
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
