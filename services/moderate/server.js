/**
 * Moderate microservice – Option 4: get next joke from submit queue; approve → moderated queue.
 * Optional OIDC (Keycloak): set OIDC_CLIENT_SECRET (and issuer/base/clientId/secret) to require login.
 * GET /moderate       – next joke (JSON) or { noJoke: true }
 * POST /moderated    – body { setup, punchline, type } → publish to moderated queue
 * GET /moderate/types – types from file cache (type_update)
 * Serves static UI at /
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { getOneFromSubmit, publishModerated } = require('./queue');
const { readCache: getTypes } = require('./typesCache');
const { startTypeUpdateConsumer } = require('./typeUpdateConsumer');
const { bootstrapFromJoke } = require('./typesCache');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json());

// Health check – always 200 so Kong sees upstream as healthy (no auth)
app.get('/health', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

// Auth status – for UI logout link (no auth required)
app.get('/moderate/auth/status', (req, res) => {
  res.json({ oidc: Boolean(process.env.OIDC_CLIENT_SECRET) });
});

// Optional OIDC: when OIDC_CLIENT_SECRET is set, protect all routes below with login
const oidcSecret = process.env.OIDC_CLIENT_SECRET;
const oidcEnabled = Boolean(oidcSecret && process.env.OIDC_ISSUER_BASE_URL && process.env.OIDC_BASE_URL && process.env.OIDC_CLIENT_ID);
if (oidcEnabled) {
  const { auth } = require('express-openid-connect');
  // After login/logout, redirect to this path so Kong routes to us; '/' would hit site root and "no Route matched"
  const oidcBasePath = process.env.OIDC_BASE_URL ? new URL(process.env.OIDC_BASE_URL).pathname.replace(/\/$/, '') || '/app/moderate' : '/app/moderate';
  app.use(
    auth({
      issuerBaseURL: process.env.OIDC_ISSUER_BASE_URL,
      baseURL: process.env.OIDC_BASE_URL,
      clientID: process.env.OIDC_CLIENT_ID,
      clientSecret: oidcSecret,
      secret: process.env.OIDC_SECRET || process.env.OIDC_CLIENT_SECRET,
      authRequired: true,
      authorizationParams: {
        response_type: 'code',
        scope: 'openid profile email',
      },
      getLoginState() {
        return { returnTo: oidcBasePath };
      },
      routes: {
        login: false,
        logout: false,
        callback: '/callback',
      },
    })
  );
  app.get('/login', (req, res) => res.oidc.login({ returnTo: oidcBasePath }));
  app.get('/logout', (req, res) => res.oidc.logout({ returnTo: req.query.returnTo || oidcBasePath }));
}

// GET /moderate – one joke from submit queue or noJoke
app.get('/moderate', async (req, res, next) => {
  try {
    const joke = await getOneFromSubmit();
    if (!joke) {
      return res.json({ noJoke: true });
    }
    res.json(joke);
  } catch (err) {
    next(err);
  }
});

// POST /moderated – approve joke (publish to moderated queue)
app.post('/moderated', async (req, res, next) => {
  try {
    const { setup, punchline, type } = req.body || {};
    if (!setup || !punchline || !type || typeof type !== 'string' || !String(type).trim()) {
      return res.status(400).json({ error: 'setup, punchline and type are required' });
    }
    await publishModerated({
      setup: String(setup).trim(),
      punchline: String(punchline).trim(),
      type: String(type).trim(),
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /moderate/types – from file cache
app.get('/moderate/types', async (req, res, next) => {
  try {
    const types = await getTypes();
    res.json(types);
  } catch (err) {
    next(err);
  }
});

// Static UI – root and /app/moderate (when Kong strips path, request may be / or /app/moderate)
app.get('/', (req, res, next) => {
  res.type('text/html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) next(err);
  });
});
app.get('/app/moderate', (req, res, next) => {
  res.type('text/html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) next(err);
  });
});
app.use(express.static(path.join(__dirname, 'public')));

// Global error handler – always send valid HTTP so Kong never sees "invalid response"
app.use((err, req, res, next) => {
  console.error('Moderate error:', err.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error', message: err.message || 'Unknown error' });
});

async function start() {
  // Listen first so the container stays up and port is reachable even if deps are slow
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Moderate service listening on ${PORT}; OIDC: ${oidcEnabled ? 'enabled' : 'disabled'}`);
  });
  // Then bootstrap and RabbitMQ consumer (non-blocking; failures logged but don't exit)
  bootstrapFromJoke(process.env.JOKE_SERVICE_URL).catch((err) =>
    console.warn('Bootstrap from joke failed:', err.message)
  );
  startTypeUpdateConsumer().catch((err) => {
    console.error('Type update consumer failed:', err.message);
  });
}

start().catch((err) => {
  console.error('Moderate startup failed:', err);
  process.exit(1);
});
