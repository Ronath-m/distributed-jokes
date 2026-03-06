/**
 * MySQL adapter – same interface as mongo.js.
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
  const [rows] = await getPool().execute('SELECT name FROM types ORDER BY name');
  return rows.map((r) => r.name);
}

function getJokesByType(type, count = 1) {
  const p = getPool();
  const limitNum = Math.max(1, Math.min(parseInt(count, 10) || 1, 100));
  if (type === 'any') {
    return p.execute(
      `SELECT j.setup, j.punchline, t.name AS type FROM jokes j JOIN types t ON j.type_id = t.id ORDER BY RAND() LIMIT ${limitNum}`
    ).then(([rows]) => (Array.isArray(rows) ? rows : []));
  }
  return p.execute(
    `SELECT j.setup, j.punchline, t.name AS type FROM jokes j JOIN types t ON j.type_id = t.id WHERE t.name = ? ORDER BY RAND() LIMIT ${limitNum}`,
    [String(type)]
  ).then(([rows]) => (Array.isArray(rows) ? rows : []));
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

async function seedIfEmpty() {
  const p = getPool();
  const [rows] = await p.execute('SELECT COUNT(*) AS c FROM types');
  if (Number(rows[0]?.c ?? 0) > 0) return;
  await p.execute("INSERT INTO types (name) VALUES ('general')");
  const [[typeRow]] = await p.execute('SELECT id FROM types WHERE name = ?', ['general']);
  await p.execute(
    'INSERT INTO jokes (type_id, setup, punchline) VALUES (?, ?, ?)',
    [typeRow.id, 'Why did the scarecrow win an award?', 'He was outstanding in his field.']
  );
  console.log('Seeded default type and joke (MySQL)');
}

module.exports = { getTypes, getJokesByType, initSchema, seedIfEmpty };
