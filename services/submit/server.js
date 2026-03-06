/**
 * Submit microservice – Option 4: publish to submit queue; types from file cache (type_update events).
 * POST /submit  – publish to submit queue (moderate → moderated → ETL)
 * GET /types   – from file cache only (updated by type_update)
 * GET /docs    – OpenAPI (Swagger) documentation
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const { publishSubmit } = require('./queue');
const { getTypes } = require('./typesCache');
const { startTypeUpdateConsumer } = require('./typeUpdateConsumer');
const openApiSpec = require('./openapi');

const app = express();
const PORT = process.env.PORT || 3200;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// OpenAPI spec at fixed path (avoids redirect loop when UI loads spec behind Kong)
app.get('/docs/spec.json', (req, res) => {
  res.json(openApiSpec);
});
// Swagger UI at /docs (no redirect; use spec from same origin)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  swaggerOptions: {
    url: '/docs/spec.json',
    displayRequestDuration: true,
  },
  customSiteTitle: 'Submit API',
}));

// POST /submit – body: { setup, punchline, type } → publish to queue
app.post('/submit', async (req, res) => {
  try {
    const { setup, punchline, type } = req.body || {};
    if (!setup || !punchline || !type || typeof type !== 'string' || !type.trim()) {
      return res.status(400).json({ error: 'setup, punchline and type are required' });
    }
    await publishSubmit({
      setup: String(setup).trim(),
      punchline: String(punchline).trim(),
      type: String(type).trim(),
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit joke' });
  }
});

// GET /types and /submit/types – from file cache only (updated by type_update consumer)
const serveTypes = async (req, res) => {
  try {
    const types = await getTypes();
    res.json(types);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch types' });
  }
};
app.get('/types', serveTypes);
app.get('/submit/types', serveTypes);

async function start() {
  const { bootstrapFromJoke } = require('./typesCache');
  await bootstrapFromJoke(process.env.JOKE_SERVICE_URL);
  await startTypeUpdateConsumer();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Submit service listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Submit startup failed:', err);
  process.exit(1);
});
