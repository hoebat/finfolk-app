import { atlasStore } from './offline-store.js';
import { activity, resourceLabel } from './activity.js';
const decode = (buffer, read, parse) => {
  if (read === 'arrayBuffer') return buffer;
  const text = new TextDecoder().decode(buffer);
  return parse ? parse(text) : read === 'json' ? JSON.parse(text) : text;
};
export class DatasetCache {
  constructor(
    base = new URL('./', import.meta.url),
    fetcher = globalThis.fetch,
    store = atlasStore,
  ) {
    this.base = new URL(base);
    this.fetcher = fetcher.bind(globalThis);
    this.store = store;
    this.pending = new Map();
    this.listeners = new Set();
    this.operations = new Map();
    this.bypass = false;
  }
  emit() {
    for (const fn of this.listeners) fn();
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  async manifest() {
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestPromise = (async () => {
      let cached = await this.store.meta('manifest:' + this.base.href);
      if (globalThis.navigator?.onLine === false) {
        const saved = (await this.store.meta('saved')) || [],
          last = await this.store.meta('lastRegion'),
          item =
            saved.find((p) => p.id === last && p.complete && p.manifest) ||
            saved.find((p) => p.complete && p.manifest);
        if (item) {
          cached = item.manifest;
          this.offlineRegion = item.id;
        }
      }
      const refresh = async () => {
        const response = await this.fetcher(
          new URL('data/downloads.json', this.base).href,
          { cache: 'no-cache', signal: AbortSignal.timeout(8000) },
        );
        if (!response.ok) throw Error('Download catalogue unavailable');
        const data = await response.json();
        if (data.version !== 1 || !data.files || !data.regions)
          throw Error('Invalid download catalogue');
        await this.store.meta('manifest:' + this.base.href, data);
        return data;
      };
      if (cached?.version === 1 && cached.files) {
        if (globalThis.navigator?.onLine !== false)
          refresh()
            .then((data) => {
              if (data.revision !== cached.revision) {
                this.latestManifest = data;
                this.emit();
              }
            })
            .catch(() => {});
        return cached;
      }
      try {
        return await refresh();
      } catch {
        return null;
      }
    })();
    return this.manifestPromise;
  }
  key(path, meta) {
    return this.base.href + path + '#' + meta.hash;
  }
  async read(path, { read = 'text', parse, signal, parent } = {}) {
    const manifest = await this.manifest(),
      meta = manifest?.files?.[path],
      key = meta ? this.key(path, meta) : null;
    const cached = key ? await this.store.get(key) : null;
    if (cached) {
      try {
        const result = decode(cached.buffer, read, parse);
        const task = activity.begin({
          label: meta.label || path,
          kind: 'Device storage',
        });
        task.finish({ bytes: cached.bytes, cached: true });
        this.store.touch(key).catch(() => {});
        return result;
      } catch {
        await this.store.remove([key]);
      }
    }
    const requestKey = key || path;
    if (this.pending.has(requestKey))
      return decode(await this.pending.get(requestKey), read, parse);
    const pending = (async () => {
      const controller = new AbortController();
      if (signal) {
        if (signal.aborted) controller.abort();
        else
          signal.addEventListener('abort', () => controller.abort(), {
            once: true,
          });
      }
      const requestURL = new URL(path, this.base);
      if (meta) requestURL.searchParams.set('v', meta.hash);
      const task = activity.begin({
          url: requestURL.href,
          label: resourceLabel(path).label || meta?.label || path,
          kind: 'Atlas download',
        }),
        op = {
          id: requestKey,
          path,
          label: resourceLabel(path).label || meta?.label || path,
          total: meta?.bytes || null,
          loaded: 0,
          controller,
          state: 'loading',
        };
      this.operations.set(requestKey, op);
      this.emit();
      let timer = setTimeout(
        () =>
          controller.abort(
            new DOMException(
              'Download stalled. Retry when connected.',
              'TimeoutError',
            ),
          ),
        45000,
      );
      try {
        const response = await this.fetcher(requestURL.href, {
          signal: controller.signal,
          cache: meta ? 'no-cache' : 'default',
        });
        if (!response.ok)
          throw Error(`Request failed (${response.status}): ${path}`);
        let buffer;
        if (response.body?.getReader) {
          const reader = response.body.getReader(),
            parts = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value);
            op.loaded += value.byteLength;
            if (parent) parent.loaded = parent.completed + op.loaded;
            clearTimeout(timer);
            timer = setTimeout(
              () =>
                controller.abort(
                  new DOMException(
                    'Download stalled. Please retry.',
                    'TimeoutError',
                  ),
                ),
              45000,
            );
            this.emit();
          }
          buffer = new Uint8Array(op.loaded);
          let offset = 0;
          for (const part of parts) {
            buffer.set(part, offset);
            offset += part.length;
          }
          buffer = buffer.buffer;
        } else buffer = await response.arrayBuffer();
        // Parse first: never persist HTML errors, malformed JSON or LFS pointers.
        decode(buffer, read, parse);
        if (meta && globalThis.crypto?.subtle) {
          const hash = [
            ...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
          ]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
          if (hash !== meta.hash) {
            this.manifestPromise = null;
            this.latestManifest = null;
            await this.store.meta('manifest:' + this.base.href, null);
            throw Error(
              'Dataset changed during download. Retry to load the latest version.',
            );
          }
        }
        if (key && !this.bypass) {
          try {
            const saved = await this.store.put({
              key,
              path,
              buffer,
              bytes: buffer.byteLength,
              used: Date.now(),
            });
            if (!saved)
              this.storageMessage =
                'Browser storage unavailable; using network only.';
          } catch {
            this.storageMessage =
              'Storage full. This file loaded without saving.';
          }
        }
        op.loaded = buffer.byteLength;
        op.state = 'done';
        task.finish({ bytes: buffer.byteLength });
        return buffer;
      } catch (error) {
        op.state = controller.signal.aborted ? 'cancelled' : 'error';
        op.error = error.message;
        task.finish({ state: op.state, error: op.error });
        throw error;
      } finally {
        clearTimeout(timer);
        this.emit();
      }
    })();
    this.pending.set(requestKey, pending);
    try {
      return decode(await pending, read, parse);
    } finally {
      this.pending.delete(requestKey);
    }
  }
  async useRegion(id) {
    if (globalThis.navigator?.onLine !== false) return;
    const saved = ((await this.store.meta('saved')) || []).find(
      (p) => p.id === id && p.complete && p.manifest,
    );
    if (saved) this.manifestPromise = Promise.resolve(saved.manifest);
  }
  async saveRegion(id) {
    if (this.latestManifest) {
      this.manifestPromise = Promise.resolve(this.latestManifest);
      this.latestManifest = null;
    }
    const manifest = await this.manifest(),
      region = manifest?.regions[id];
    if (!region) throw Error('Region download information is unavailable.');
    const keys = region.files.map((path) =>
      this.key(path, manifest.files[path]),
    );
    const available = new Set((await this.store.all()).map((r) => r.key)),
      missing = region.files.filter(
        (path) => !available.has(this.key(path, manifest.files[path])),
      );
    const op = {
      id: 'region:' + id,
      label: region.name,
      total: missing.reduce((n, path) => n + manifest.files[path].bytes, 0),
      loaded: 0,
      completed: 0,
      controller: new AbortController(),
      state: 'loading',
      package: true,
    };
    this.operations.set(op.id, op);
    this.emit();
    const previous = (await this.store.meta('saved')) || [],
      old = previous.find((p) => p.id === id),
      record = {
        id,
        name: region.name,
        keys: old?.complete ? old.keys : keys,
        pendingKeys: keys,
        complete: old?.complete || false,
        version: old?.version || manifest.revision,
        manifest: old?.manifest || manifest,
        pending: true,
      };
    // Reserve files against recent-cache eviction while the package is downloading.
    await this.store.meta('saved', [
      ...previous.filter((p) => p.id !== id),
      record,
    ]);
    try {
      for (const path of region.files) {
        if (op.controller.signal.aborted)
          throw new DOMException('Cancelled', 'AbortError');
        await this.read(path, {
          read:
            path.endsWith('.gz') || path.endsWith('.png')
              ? 'arrayBuffer'
              : 'json',
          signal: op.controller.signal,
          parent: op,
        });
        if (missing.includes(path)) {
          op.completed += manifest.files[path].bytes;
          op.loaded = op.completed;
          this.emit();
        }
        if (!(await this.store.get(this.key(path, manifest.files[path]))))
          throw Error('Storage unavailable. Region was not saved offline.');
      }
      record.complete = true;
      record.keys = keys;
      record.version = manifest.revision;
      record.manifest = manifest;
      record.pending = false;
      delete record.pendingKeys;
      await this.store.meta('saved', [
        ...((await this.store.meta('saved')) || []).filter((p) => p.id !== id),
        record,
      ]);
      await globalThis.navigator?.storage?.persist?.();
    } finally {
      if (record.pending && old?.manifest)
        this.manifestPromise = Promise.resolve(old.manifest);
      op.state = op.controller.signal.aborted
        ? 'cancelled'
        : record.pending
          ? 'error'
          : 'done';
      this.emit();
      this.store.emit();
    }
  }
  async removeRegion(id) {
    const saved = (await this.store.meta('saved')) || [],
      item = saved.find((p) => p.id === id),
      others = saved.filter((p) => p.id !== id),
      keep = new Set(
        others.flatMap((p) => [...p.keys, ...(p.pendingKeys || [])]),
      );
    await this.store.meta('saved', others);
    if (item)
      await this.store.remove(
        [...new Set([...item.keys, ...(item.pendingKeys || [])])].filter(
          (key) => !keep.has(key),
        ),
      );
    this.store.emit();
  }
}
