/**
 * Database layer – Option 1: direct MySQL. No duplicate types in types table.
 */

const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      user: process.env.DB_USER || 'jokeuser',
      password: process.env.DB_PASSWORD || 'jokepass',
      database: process.env.DB_NAME || 'jokedb',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

async function getTypes() {
  const [rows] = await getPool().execute(
    'SELECT name FROM types ORDER BY name'
  );
  return rows.map((r) => r.name);
}

/**
 * Insert type if not exists; then insert joke. Uses IGNORE to avoid duplicate type.
 */
async function submitJoke({ setup, punchline, type }) {
  const p = getPool();
  await p.execute(
    'INSERT IGNORE INTO types (name) VALUES (?)',
    [type.trim()]
  );
  const [[row]] = await p.execute(
    'SELECT id FROM types WHERE name = ? LIMIT 1',
    [type.trim()]
  );
  const typeId = row.id;
  await p.execute(
    'INSERT INTO jokes (type_id, setup, punchline) VALUES (?, ?, ?)',
    [typeId, setup, punchline]
  );
}

module.exports = { getPool, getTypes, submitJoke };
