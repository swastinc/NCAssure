// src/utils/storage.js
export function loadCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export function removeCache(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function removeByPrefix(prefix) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}
