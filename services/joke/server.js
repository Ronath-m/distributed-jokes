/**
 * Joke microservice – Option 1+ (Option 4: can switch to MySQL or MongoDB via env)
 * GET /joke/:type?count  – random joke(s) by type
 * GET /types            – all joke types from DB
 * Serves static UI from /public
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { initSchema, seedIfEmpty, getJokesByType, getTypes } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static UI (explicit root so proxy gets a clean response)
app.get('/', (req, res) => {
  res.type('text/html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// GET /joke/:type?count – one or more random jokes (count optional)
app.get('/joke/:type', async (req, res) => {
  try {
    const type = String(req.params.type || '').trim() || 'any';
    const count = Math.min(Math.max(parseInt(req.query.count, 10) || 1, 100), 100);
    const jokes = await getJokesByType(type, count);
    res.json(jokes);
  } catch (err) {
    console.error('GET /joke error:', err.message, err.code || '');
    res.status(500).json({ error: 'Failed to fetch jokes', message: err.message });
  }
});

// GET /types – all joke types (for dropdowns)
app.get('/types', async (req, res) => {
  try {
    const types = await getTypes();
    res.json(types);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch types' });
  }
});

// Start only after DB schema and seed are ready (adapter chosen by DB_TYPE)
initSchema()
  .then(() => seedIfEmpty())
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Joke service listening on ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
