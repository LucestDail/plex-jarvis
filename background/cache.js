// JARVIS Background Cache Core — Service Worker에서 IndexedDB 관리
// 스키마:
//   analysis  { url, title, signature, summary, elements, tags?, updatedAt }
//   chat      { url, messages, updatedAt }
//   watchlist { url, title, interval, signature, lastChecked, createdAt }
//   history   { id, url, signature, summary, snapshotAt }

(() => {
  const DB_NAME = 'jarvis-cache';
  const DB_VERSION = 2;
  const STORE_ANALYSIS = 'analysis';
  const STORE_CHAT = 'chat';
  const STORE_WATCH = 'watchlist';
  const STORE_HISTORY = 'history';

  let dbPromise = null;

  const openDB = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE_ANALYSIS)) {
          const store = db.createObjectStore(STORE_ANALYSIS, { keyPath: 'url' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains(STORE_CHAT)) {
          db.createObjectStore(STORE_CHAT, { keyPath: 'url' });
        }
        if (!db.objectStoreNames.contains(STORE_WATCH)) {
          const store = db.createObjectStore(STORE_WATCH, { keyPath: 'url' });
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(STORE_HISTORY)) {
          const store = db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
          store.createIndex('url', 'url');
          store.createIndex('snapshotAt', 'snapshotAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  };

  const getStore = async (name, mode = 'readonly') => {
    const db = await openDB();
    return db.transaction(name, mode).objectStore(name);
  };

  const normalizeUrl = (url) => {
    try {
      const u = new URL(url);
      u.hash = '';
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']
        .forEach((k) => u.searchParams.delete(k));
      return u.toString();
    } catch (_) { return url; }
  };

  const getTTL = async () => new Promise((resolve) => {
    chrome.storage.local.get(['cacheTtlHours'], (res) => {
      const hours = typeof res.cacheTtlHours === 'number' && res.cacheTtlHours > 0 ? res.cacheTtlHours : 24;
      resolve(hours * 60 * 60 * 1000);
    });
  });

  // ===== Analysis =====
  const getAnalysis = async (url) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_ANALYSIS);
    const ttl = await getTTL();
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return resolve(null);
        resolve({ ...row, stale: Date.now() - row.updatedAt > ttl });
      };
      req.onerror = () => resolve(null);
    });
  };

  const putAnalysis = async (url, payload, meta = {}) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_ANALYSIS, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => {
        const prev = req.result || {};
        const tags = meta.tags !== undefined ? meta.tags : (prev.tags || []);
        const row = {
          url: key,
          title: meta.title || prev.title || '',
          signature: meta.signature || prev.signature || null,
          summary: payload.summary || prev.summary || '',
          elements: Array.isArray(payload.elements) ? payload.elements : (prev.elements || []),
          tags,
          language: payload.language || prev.language || '',
          translated: payload.translated === true ? true : (prev.translated === true),
          updatedAt: Date.now(),
        };
        const put = store.put(row);
        put.onsuccess = () => resolve(true);
        put.onerror = () => reject(put.error);
      };
      req.onerror = () => reject(req.error);
    });
  };

  const deleteAnalysis = async (url) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_ANALYSIS, 'readwrite');
    return new Promise((resolve) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  };

  const listAnalysis = async (options = {}) => {
    const store = await getStore(STORE_ANALYSIS);
    const query = (options.query || '').toLowerCase();
    const tagFilter = options.tag || '';
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        let list = (req.result || []).map((r) => ({
          url: r.url,
          title: r.title,
          updatedAt: r.updatedAt,
          summaryPreview: (r.summary || '').slice(0, 160),
          elementCount: (r.elements || []).length,
          tags: r.tags || [],
          translated: !!r.translated,
          language: r.language || '',
        }));
        if (query) {
          list = list.filter((item) =>
            item.title.toLowerCase().includes(query) ||
            item.url.toLowerCase().includes(query) ||
            item.summaryPreview.toLowerCase().includes(query) ||
            (item.tags || []).some((t) => t.toLowerCase().includes(query))
          );
        }
        if (tagFilter) {
          list = list.filter((item) => (item.tags || []).includes(tagFilter));
        }
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  };

  const clearAnalysis = async () => {
    const store = await getStore(STORE_ANALYSIS, 'readwrite');
    return new Promise((resolve) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  };

  const updateTags = async (url, tags) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_ANALYSIS, 'readwrite');
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return resolve(false);
        row.tags = Array.isArray(tags) ? tags : [];
        const put = store.put(row);
        put.onsuccess = () => resolve(true);
        put.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    });
  };

  const listAllTags = async () => {
    const list = await listAnalysis();
    const counts = new Map();
    list.forEach((item) => (item.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return Array.from(counts.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  };

  // ===== Chat =====
  const getChat = async (url) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_CHAT);
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.messages : []);
      req.onerror = () => resolve([]);
    });
  };

  const putChat = async (url, messages) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_CHAT, 'readwrite');
    return new Promise((resolve) => {
      const req = store.put({ url: key, messages, updatedAt: Date.now() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  };

  const clearChat = async () => {
    const store = await getStore(STORE_CHAT, 'readwrite');
    return new Promise((resolve) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  };

  // ===== Watchlist =====
  const addWatch = async (url, title, interval = 60) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_WATCH, 'readwrite');
    return new Promise((resolve) => {
      const req = store.put({
        url: key,
        title: title || '',
        interval,
        signature: null,
        lastChecked: 0,
        createdAt: Date.now(),
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  };

  const removeWatch = async (url) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_WATCH, 'readwrite');
    return new Promise((resolve) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  };

  const listWatch = async () => {
    const store = await getStore(STORE_WATCH);
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => resolve([]);
    });
  };

  const isWatched = async (url) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_WATCH);
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  };

  const updateWatchState = async (url, patch) => {
    const key = normalizeUrl(url);
    const store = await getStore(STORE_WATCH, 'readwrite');
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return resolve(false);
        Object.assign(row, patch || {});
        const put = store.put(row);
        put.onsuccess = () => resolve(true);
        put.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    });
  };

  // ===== History =====
  const addHistory = async (url, entry) => {
    const store = await getStore(STORE_HISTORY, 'readwrite');
    return new Promise((resolve) => {
      const req = store.add({
        url: normalizeUrl(url),
        signature: entry.signature || '',
        summary: entry.summary || '',
        note: entry.note || '',
        snapshotAt: Date.now(),
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  };

  const listHistory = async (url) => {
    const store = await getStore(STORE_HISTORY);
    const idx = store.index('url');
    const key = normalizeUrl(url);
    return new Promise((resolve) => {
      const req = idx.getAll(IDBKeyRange.only(key));
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.snapshotAt - a.snapshotAt));
      req.onerror = () => resolve([]);
    });
  };

  const clearHistory = async () => {
    const store = await getStore(STORE_HISTORY, 'readwrite');
    return new Promise((resolve) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  };

  self.JarvisCacheCore = {
    normalizeUrl,
    getAnalysis, putAnalysis, deleteAnalysis, listAnalysis, clearAnalysis,
    updateTags, listAllTags,
    getChat, putChat, clearChat,
    addWatch, removeWatch, listWatch, isWatched, updateWatchState,
    addHistory, listHistory, clearHistory,
  };
})();
