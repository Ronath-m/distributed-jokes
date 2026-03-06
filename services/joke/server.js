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

// Upstream is ready only after DB init (so Kong gets valid responses immediately)
let dbReady = false;

app.use(express.json());
// Health check – always 200 so Kong sees upstream as healthy
app.get('/health', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});
// Serve static UI (explicit root so proxy gets a clean response)
app.get('/', (req, res) => {
  res.type('text/html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// GET /joke/:type?count – one or more random jokes (count optional)
app.get('/joke/:type', async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Starting up', message: 'Database not ready yet' });
  }
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
  if (!dbReady) {
    return res.status(503).json({ error: 'Starting up', types: [] });
  }
  try {
    const types = await getTypes();
    res.json(types);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch types' });
  }
});

// Start HTTP server immediately so Kong never gets "connection refused"
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Joke service listening on ${PORT}`);
});

// Retry DB init in background so we survive MySQL not ready at first boot (e.g. on Azure VM)
// Keep retrying indefinitely – DB might come up late on a slow VM.
const RETRY_MS = 2000;

function tryDbInit(attempt = 1) {
  return initSchema()
    .then(() => seedIfEmpty())
    .then(() => {
      dbReady = true;
      console.log('DB ready');
    })
    .catch((err) => {
      console.warn(`DB init attempt ${attempt} failed:`, err.message);
      return new Promise((resolve) => setTimeout(resolve, RETRY_MS)).then(() =>
        tryDbInit(attempt + 1)
      );
    });
}

tryDbInit();
