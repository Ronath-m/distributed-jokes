/**
 * Option 4: types from file cache only. Updated by type_update events.
 * Bootstrap: if file empty on startup, fetch from joke service once.
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

async function addType(typeName) {
  const name = String(typeName || '').trim();
  if (!name) return;
  const types = await readCache();
  if (types.includes(name)) return;
  types.push(name);
  types.sort();
  await writeCache(types);
}

async function bootstrapFromJoke(jokeServiceUrl) {
  const existing = await readCache();
  if (existing.length > 0) return;
  try {
    const base = (jokeServiceUrl || '').replace(/\/$/, '');
    if (!base) return;
    const res = await fetch(base + '/types');
    if (!res.ok) return;
    const types = await res.json();
    if (Array.isArray(types) && types.length > 0) {
      await writeCache(types);
      console.log('Submit types cache bootstrapped from joke service');
    }
  } catch (err) {
    console.warn('Submit types bootstrap failed:', err.message);
  }
}

module.exports = { getTypes: readCache, readCache, writeCache, addType, bootstrapFromJoke };
