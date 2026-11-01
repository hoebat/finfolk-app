export const MAP_DEFAULTS = Object.freeze({depth:true, contours:true, context:true, pins:false,
  coverage:false, basemap:true, measurement:true, interval:5});
const key = 'finfolk-map-settings';

/** Device preferences stay usable when storage is blocked or contains older data. */
export function createPreferences(storage) {
  if (arguments.length === 0) { try { storage = globalThis.localStorage; } catch {} }
  let saved = {}, persisted = true;
  try { saved = JSON.parse(storage?.getItem(key) || '{}') || {}; } catch {}
  const values = {...MAP_DEFAULTS}, listeners = new Set();
  for (const name of Object.keys(values)) {
    if (name === 'interval') {
      if ([2,5].includes(saved[name])) values[name] = saved[name];
    } else if (typeof saved[name] === 'boolean') values[name] = saved[name];
  }
  if (typeof saved.measurement !== 'boolean') {
    try { values.measurement = storage?.getItem('shore-depth:measurement-visible') !== 'false'; } catch {}
  }
  return {
    get: () => ({...values}),
    get persisted() { return persisted; },
    set(name, value) {
      if (!Object.hasOwn(MAP_DEFAULTS, name) || (name === 'interval' ? ![2,5].includes(value) : typeof value !== 'boolean')) return;
      values[name] = value;
      try {
        if (!storage) throw Error('Storage unavailable');
        storage.setItem(key, JSON.stringify(values));
        if (name === 'measurement') storage.setItem('shore-depth:measurement-visible', String(value));
        persisted = true;
      } catch { persisted = false; }
      for (const fn of listeners) fn({...values});
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
