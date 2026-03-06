/**
 * MySQL adapter for ETL – initSchema, loadJoke.
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

async function initSchema() {
  const p = getPool();
  await p.execute(`
    CREATE TABLE IF NOT EXISTS types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    )
  `);
  await p.execute(`
    CREATE TABLE IF NOT EXISTS jokes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type_id INT NOT NULL,
      setup TEXT NOT NULL,
      punchline TEXT NOT NULL,
      FOREIGN KEY (type_id) REFERENCES types(id)
    )
  `);
}

async function loadJoke({ setup, punchline, type }) {
  const p = getPool();
  const name = String(type || '').trim();
  const [existing] = await p.execute('SELECT id FROM types WHERE name = ? LIMIT 1', [name]);
  const wasNewType = !existing || existing.length === 0;
  await p.execute('INSERT IGNORE INTO types (name) VALUES (?)', [name]);
  const [[row]] = await p.execute('SELECT id FROM types WHERE name = ? LIMIT 1', [name]);
  await p.execute(
    'INSERT INTO jokes (type_id, setup, punchline) VALUES (?, ?, ?)',
    [row.id, setup, punchline]
  );
  return { wasNewType };
}

module.exports = { initSchema, loadJoke };
