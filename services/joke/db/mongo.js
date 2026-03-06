/**
 * MongoDB adapter – same interface as mysql.js.
 * Uses MONGO_URI or DB_HOST/DB_PORT/DB_NAME; collection names: types, jokes.
 */

const { MongoClient } = require('mongodb');

const COLL_TYPES = 'types';
const COLL_JOKES = 'jokes';

let client = null;
let db = null;

function getUri() {
  if (process.env.MONGO_URI) return process.env.MONGO_URI;
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 27017;
  const name = process.env.DB_NAME || 'jokedb';
  return `mongodb://${host}:${port}/${name}`;
}

async function getDb() {
  if (db) return db;
  client = new MongoClient(getUri());
  await client.connect();
  db = client.db();
  return db;
}

async function getTypes() {
  const d = await getDb();
  const rows = await d.collection(COLL_TYPES).find({}).sort({ name: 1 }).toArray();
  return rows.map((r) => r.name);
}

async function getJokesByType(type, count = 1) {
  const d = await getDb();
  const limit = Math.max(1, Math.min(parseInt(count, 10) || 1, 100));
  const filter = type === 'any' ? {} : { typeName: String(type) };
  const rows = await d.collection(COLL_JOKES)
    .aggregate([{ $match: filter }, { $sample: { size: limit } }])
    .toArray();
  return rows.map((r) => ({ setup: r.setup, punchline: r.punchline, type: r.typeName }));
}

async function initSchema() {
  const d = await getDb();
  await d.collection(COLL_TYPES).createIndex({ name: 1 }, { unique: true });
  await d.collection(COLL_JOKES).createIndex({ typeName: 1 });
}

async function seedIfEmpty() {
  const d = await getDb();
  const n = await d.collection(COLL_TYPES).countDocuments();
  if (n > 0) return;
  await d.collection(COLL_TYPES).insertOne({ name: 'general' });
  await d.collection(COLL_JOKES).insertOne({
    setup: 'Why did the scarecrow win an award?',
    punchline: 'He was outstanding in his field.',
    typeName: 'general',
  });
  console.log('Seeded default type and joke (MongoDB)');
}

module.exports = { getTypes, getJokesByType, initSchema, seedIfEmpty };
