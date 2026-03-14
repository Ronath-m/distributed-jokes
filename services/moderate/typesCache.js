/**
 * Types file cache for Option 4. Updated by type_update events.
 * Bootstrap: on startup, sync from joke service so cache matches current DB (e.g. after switching MySQL/Mongo).
 */

const fs = require('fs').promises;
const path = require('path');

const CACHE_PATH = process.env.TYPES_CACHE_PATH || path.join(__dirname, '..', 'data', 'types.json');

async function ensureDir() {
  const dir = path.dirname(CACHE_PATH);
  await fs.mkdir(dir, { recursive: true });
}

async function readCache() {
  try {
    const data = await fs.readFile(CACHE_PATH, 'utf8');
    const out = JSON.parse(data);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

async function writeCache(types) {
  await ensureDir();
  const list = Array.isArray(types) ? types : [];
  await fs.writeFile(CACHE_PATH, JSON.stringify(list), 'utf8');
}

/** Add a type to the cache (from type_update event). Merge and sort. */
async function addType(typeName) {
  const name = String(typeName || '').trim();
  if (!name) return;
  const types = await readCache();
  if (types.includes(name)) return;
  types.push(name);
  types.sort();
  await writeCache(types);
}

/** Sync types from joke service on startup so cache matches current DB (e.g. after switching MySQL/Mongo). */
async function bootstrapFromJoke(jokeServiceUrl) {
  try {
    const base = (jokeServiceUrl || '').replace(/\/$/, '');
    if (!base) return;
    const res = await fetch(base + '/types');
    if (!res.ok) return;
    const types = await res.json();
    if (Array.isArray(types)) {
      await writeCache(types);
      console.log('Moderate types cache synced from joke service (' + types.length + ' types)');
    }
  } catch (err) {
    console.warn('Moderate types bootstrap failed:', err.message);
  }
}

module.exports = { readCache, writeCache, addType, bootstrapFromJoke };
