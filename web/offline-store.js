// Only public atlas files belong here. Never store account responses or tokens.
export class AtlasStore {
  constructor(factory = globalThis.indexedDB) {
    this.factory = factory;
    this.disabled = !factory;
    this.listeners = new Set();
    this.limit = 250 * 1024 ** 2;
  }
  emit() {
    for (const fn of this.listeners) fn();
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  async db() {
    if (this.disabled) return null;
    if (!this.opening)
      this.opening = new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) {
            value?.close();
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (!value) this.disabled = true;
          resolve(value);
        };
        const timer = setTimeout(() => finish(null), 2000);
        let request;
        try {
          request = this.factory.open('finfolk-atlas', 1);
        } catch {
          finish(null);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('files', { keyPath: 'key' });
          db.createObjectStore('meta');
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            this.opening = null;
          };
          finish(request.result);
        };
        request.onerror = request.onblocked = () => finish(null);
      });
    return this.opening;
  }
  async run(store, mode, operation) {
    const db = await this.db();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request ? request.result : true);
      tx.onerror = tx.onabort = () =>
        reject(tx.error || Error('Browser storage unavailable'));
    });
  }
  async get(key) {
    try {
      return await this.run('files', 'readonly', (s) => s.get(key));
    } catch {
      return null;
    }
  }
  async touch(key) {
    const db = await this.db();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction('files', 'readwrite'),
        store = tx.objectStore('files'),
        request = store.get(key);
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, used: Date.now() });
      };
      tx.oncomplete = tx.onabort = tx.onerror = resolve;
    });
  }
  async all() {
    try {
      return (await this.run('files', 'readonly', (s) => s.getAll())) || [];
    } catch {
      return [];
    }
  }
  async meta(key, value) {
    try {
      return value === undefined
        ? await this.run('meta', 'readonly', (s) => s.get(key))
        : await this.run('meta', 'readwrite', (s) => s.put(value, key));
    } catch {
      return null;
    }
  }
  async remove(keys) {
    for (const key of keys)
      await this.run('files', 'readwrite', (s) => s.delete(key));
    this.emit();
  }
  async put(entry) {
    if (!(await this.db())) return false;
    const limit = (await this.meta('limit')) || this.limit,
      rows = await this.all(),
      pinned = new Set(
        ((await this.meta('saved')) || []).flatMap((p) => [
          ...p.keys,
          ...(p.pendingKeys || []),
        ]),
      );
    let total =
      rows
        .filter((r) => !pinned.has(r.key) && r.key !== entry.key)
        .reduce((n, r) => n + r.bytes, 0) + entry.bytes;
    for (const row of rows
      .filter((r) => !pinned.has(r.key) && r.key !== entry.key)
      .sort((a, b) => a.used - b.used)) {
      if (total <= limit) break;
      await this.remove([row.key]);
      total -= row.bytes;
    }
    if (entry.bytes > limit && !pinned.has(entry.key)) return false;
    try {
      await this.run('files', 'readwrite', (s) => s.put(entry));
      this.emit();
      return true;
    } catch (error) {
      this.emit();
      throw error;
    }
  }
}
export const atlasStore = new AtlasStore();
