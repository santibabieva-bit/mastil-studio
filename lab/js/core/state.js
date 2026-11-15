/**
 * Estado en la URL (hash) y almacenamiento local seguro.
 * El hash tiene la forma  #/herramienta?clave=valor&…
 */

export function parseHash(hash = '') {
  const text = String(hash).replace(/^#\/?/, '');
  const [path, query = ''] = text.split('?');
  const params = {};
  for (const [key, value] of new URLSearchParams(query)) params[key] = value;
  return { tool: path || '', params };
}

export function buildHash(tool, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const q = query.toString();
  return `#/${tool}${q ? `?${q}` : ''}`;
}

/** Convierte "1"/"true" en booleano, número si procede. */
export function coerce(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof fallback === 'boolean') return value === '1' || value === 'true';
  if (typeof fallback === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return value;
}

export function createStorage(backend = null) {
  let store = backend;
  if (!store) {
    try {
      store = globalThis.localStorage ?? null;
      if (store) {
        store.setItem('__lab_probe', '1');
        store.removeItem('__lab_probe');
      }
    } catch {
      store = null;
    }
  }
  const memory = new Map();
  return {
    get(key, fallback = null) {
      try {
        const raw = store ? store.getItem(`lab:${key}`) : memory.get(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try {
        if (store) store.setItem(`lab:${key}`, raw);
        else memory.set(key, raw);
      } catch {
        memory.set(key, raw);
      }
    },
    remove(key) {
      try {
        if (store) store.removeItem(`lab:${key}`);
      } catch {
        /* ignorar */
      }
      memory.delete(key);
    },
  };
}
