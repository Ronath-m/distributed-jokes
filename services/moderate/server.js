/**
 * Moderate microservice – Option 4 (ECST).
 * GET /moderate – one joke from submit queue (or none); POST /moderated – publish to moderated queue.
 * GET /types – from file cache (updated by type_update events).
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { getOneFromSubmit, publishModerated } = require('./queue');
const { readCache, bootstrapFromJoke } = require('./typesCache');
const { startTypeUpdateConsumer } = require('./typeUpdateConsumer');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /moderate – one message from submit queue, or { noJoke: true }
app.get('/moderate', async (req, res) => {
  try {
    const payload = await getOneFromSubmit();
    if (!payload) {
      return res.json({ noJoke: true });
    }
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get joke' });
  }
});

// POST /moderated – body: { setup, punchline, type }
app.post('/moderated', async (req, res) => {
  try {
    const { setup, punchline, type } = req.body || {};
    if (!setup || !punchline || !type || typeof type !== 'string' || !type.trim()) {
      return res.status(400).json({ error: 'setup, punchline and type required' });
    }
    await publishModerated({
      setup: String(setup).trim(),
      punchline: String(punchline).trim(),
      type: String(type).trim(),
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit moderated joke' });
  }
});

// GET /types and /moderate/types – from file cache (Kong sends /moderate/types)
const serveTypes = async (req, res) => {
  try {
    const types = await readCache();
    res.json(types);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get types' });
  }
};
app.get('/types', serveTypes);
app.get('/moderate/types', serveTypes);

async function start() {
  await bootstrapFromJoke(process.env.JOKE_SERVICE_URL);
  await startTypeUpdateConsumer();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Moderate service listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Moderate startup failed:', err);
  process.exit(1);
});
