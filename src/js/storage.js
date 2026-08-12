import { STORAGE_KEYS } from "./config.js";
import { createId } from "./utils.js";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function sanitizeEntry(entry, saved = false) {
  const clicks = Number(entry?.clicks);
  const duration = Number(entry?.duration ?? entry?.time);
  const completedAt = typeof entry?.completedAt === "string"
    ? entry.completedAt
    : typeof entry?.date === "string"
      ? entry.date
      : new Date().toISOString();

  if (!Number.isFinite(clicks) || clicks < 0 || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return {
    id: typeof entry?.id === "string" ? entry.id : createId(),
    inputCode: typeof entry?.inputCode === "string" ? entry.inputCode : (typeof entry?.key === "string" ? entry.key : "Unknown"),
    inputLabel: typeof entry?.inputLabel === "string" ? entry.inputLabel : (typeof entry?.key === "string" ? entry.key : "Unknown"),
    duration,
    clicks: Math.round(clicks),
    completedAt,
    saved: Boolean(entry?.saved ?? saved),
  };
}

function migrateLegacyHistory() {
  const current = readJson(STORAGE_KEYS.history, null);
  if (Array.isArray(current)) return current.map(entry => sanitizeEntry(entry)).filter(Boolean);

  const legacyUnsaved = readJson(STORAGE_KEYS.legacyUnsaved, []);
  const legacySaved = readJson(STORAGE_KEYS.legacySaved, []);
  const migrated = [
    ...(Array.isArray(legacyUnsaved) ? legacyUnsaved.map(entry => sanitizeEntry(entry, false)) : []),
    ...(Array.isArray(legacySaved) ? legacySaved.map(entry => sanitizeEntry(entry, true)) : []),
  ].filter(Boolean);

  if (migrated.length > 0) writeJson(STORAGE_KEYS.history, migrated);
  return migrated;
}

export function loadHistory() {
  return migrateLegacyHistory();
}

export function saveHistoryEntry(entry) {
  const history = loadHistory();
  history.push(sanitizeEntry(entry) ?? entry);
  return writeJson(STORAGE_KEYS.history, history);
}

export function updateHistoryEntry(id, updates) {
  const history = loadHistory();
  const index = history.findIndex(entry => entry.id === id);
  if (index === -1) return false;
  history[index] = { ...history[index], ...updates };
  return writeJson(STORAGE_KEYS.history, history);
}

export function deleteHistoryEntry(id) {
  const history = loadHistory().filter(entry => entry.id !== id);
  return writeJson(STORAGE_KEYS.history, history);
}

export function clearHistory() {
  return writeJson(STORAGE_KEYS.history, []);
}
