/**
 * MongoDB adapter for ETL – initSchema, loadJoke.
 * Same collection layout as joke/db/mongo.js (types.name, jokes.typeName).
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

async function initSchema() {
  const d = await getDb();
  await d.collection(COLL_TYPES).createIndex({ name: 1 }, { unique: true });
  await d.collection(COLL_JOKES).createIndex({ typeName: 1 });
}

async function loadJoke({ setup, punchline, type }) {
  const d = await getDb();
  const typeName = String(type || '').trim();
  const res = await d.collection(COLL_TYPES).findOneAndUpdate(
    { name: typeName },
    { $setOnInsert: { name: typeName } },
    { upsert: true, returnDocument: 'before' }
  );
  const wasNewType = res == null;
  await d.collection(COLL_JOKES).insertOne({
    setup: String(setup).trim(),
    punchline: String(punchline).trim(),
    typeName,
  });
  return { wasNewType };
}

module.exports = { initSchema, loadJoke };
