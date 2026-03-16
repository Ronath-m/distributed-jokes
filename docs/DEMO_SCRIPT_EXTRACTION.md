# Demo Script Extraction – Option 4 Distributed Architecture

Implementation details extracted from the codebase for a 15-minute demo video. All references are to actual files and code in the repo.

---

## 1. System Architecture Overview

### Services Implemented

| Service | Purpose | Container | VM (Azure) | Ports | Dependencies |
|--------|---------|-----------|------------|-------|--------------|
| **Kong** | API gateway: single origin, route to joke/submit/moderate, rate limit joke API | `kong-kong-1` | jokes-kong-vm (10.0.1.4) | 8000 (internal), 8444 admin | kong.yml |
| **Nginx** | TLS termination with Let's Encrypt; proxy to Kong | `kong-nginx-1` | jokes-kong-vm | 80, 8443 | Kong |
| **RabbitMQ** | Message broker: submit queue, moderated queue, type_update fanout | `rabbitmq` | jokes-rabbitmq-vm (10.0.1.5) | 5672, 15672 | — |
| **Joke** | Serve jokes from DB; GET /joke/:type, GET /types; static UI | `joke-joke-1` | jokes-joke-vm (10.1.1.4) | 3000 | MySQL or Mongo |
| **ETL** | Consume moderated queue → write to DB; publish type_update on new type | `joke-etl-1` | jokes-joke-vm | 3001 (alive) | RabbitMQ, MySQL or Mongo |
| **MySQL** | Primary DB: types + jokes | `joke-mysql-1` | jokes-joke-vm | 3306 | — |
| **Mongo** | Alternative DB (same schema) | `joke-mongo-1` | jokes-joke-vm | 27017 | — |
| **Submit** | POST /submit → publish to submit queue; GET /types from file cache; OpenAPI /docs | `submit` | jokes-submit-vm (10.2.1.5) | 3200 | RabbitMQ, JOKE_SERVICE_URL |
| **Moderate** | GET /moderate (one from submit queue), POST /moderated → moderated queue; OIDC; types from file cache | `moderate-moderate-1` | jokes-moderate-vm (10.2.1.4) | 3100 | RabbitMQ, JOKE_SERVICE_URL |

**Key files (per service):**

- Kong: `gateway/kong-azure.example.yml`, `deploy/kong/docker-compose-le-nginx.yml`, `deploy/kong/nginx-ssl.conf`
- RabbitMQ: `deploy/rabbitmq/docker-compose.yml`
- Joke: `services/joke/server.js`, `services/joke/db/index.js`, `services/joke/db/mysql.js`, `services/joke/db/mongo.js`
- ETL: `services/etl/server.js`, `services/etl/db/index.js`, `services/etl/db/mysql.js`, `services/etl/db/mongo.js`
- Submit: `services/submit/server.js`, `services/submit/queue.js`, `services/submit/typesCache.js`, `services/submit/typeUpdateConsumer.js`
- Moderate: `services/moderate/server.js`, `services/moderate/queue.js`, `services/moderate/typesCache.js`, `services/moderate/typeUpdateConsumer.js`

### Network Architecture

- **Docker (per VM):** Each VM runs its own compose; containers use the default bridge (e.g. `joke_default`, `kongnet`). Service discovery by **service name** (e.g. `mysql`, `mongo`, `kong`).
- **Azure:** Three VNets (10.0.0.0/16 gateway, 10.1.0.0/16 joke, 10.2.0.0/16 apps) with **bidirectional peering**. Kong forwards by **private IP** (e.g. `http://10.1.1.4:3000`, `http://10.2.1.4:3100`, `http://10.2.1.5:3200`). Submit and Moderate get `JOKE_IP` and `RABBITMQ_IP` from Terraform/CD (10.1.1.4, 10.0.1.5).
- **Single entry:** Only Kong has a public IP (and optional FQDN). All user traffic hits Kong (or Nginx in front of Kong) then is routed by path.

---

## 2. End-to-End System Workflow

**User submits joke → moderation → database → joke retrieval**

1. **Request enters:** User posts to `https://<kong-fqdn>:8443/app/submit` (or `/submit`). Kong (or Nginx then Kong) receives it.
2. **Gateway:** Kong matches route `submit-service`, `strip_path: false` for `/submit`; forwards to `http://10.2.1.5:3200/submit`. File: `gateway/kong-azure.example.yml`.
3. **Submit service:** `services/submit/server.js` – `POST /submit` handler reads `{ setup, punchline, type }`, calls `publishSubmit(payload)` from `services/submit/queue.js`.
4. **Message created:** JSON `{ setup, punchline, type }` sent to RabbitMQ queue **submit** with `persistent: true`. File: `services/submit/queue.js` – `publishSubmit()`, `sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), { persistent: true })`.
5. **Queue:** Queue name **submit** (env `SUBMIT_QUEUE`). Durable; survives broker restart.
6. **Consumer (moderation):** Moderate service does not run a long-lived consumer. On **GET /moderate** it calls `getOneFromSubmit()` in `services/moderate/queue.js`, which uses `ch.get(SUBMIT_QUEUE, { noAck: false })` to take one message, parse JSON, then `ch.ack(msg)` and returns the payload. So the “consumer” is on-demand per HTTP request.
7. **Moderator approves:** User edits (optional) and clicks approve. Browser POSTs to `/moderated` with `{ setup, punchline, type }`. `services/moderate/server.js` – `POST /moderated` calls `publishModerated(payload)` in `services/moderate/queue.js`.
8. **Moderated queue:** Message published to queue **moderated** (env `MODERATED_QUEUE`), again `persistent: true`. File: `services/moderate/queue.js` – `publishModerated()`.
9. **ETL consumes:** `services/etl/server.js` – `runConsumer()` asserts queue **moderated**, `ch.prefetch(1)`, `ch.consume(MODERATED_QUEUE, ...)`. For each message: parse JSON, call `loadJoke({ setup, punchline, type })` from `services/etl/db/index.js` (MySQL or Mongo adapter).
10. **Transform:** Minimal: validate `setup`, `punchline`, `type`; DB layer ensures type exists (insert if new), then insert joke. “Transform” is type normalization and DB write.
11. **Stored in DB:** MySQL: `services/etl/db/mysql.js` – `loadJoke()` does `INSERT IGNORE INTO types (name)`, `SELECT id FROM types`, `INSERT INTO jokes (type_id, setup, punchline)`. Mongo: `services/etl/db/mongo.js` – `findOneAndUpdate` on `types` (upsert), `insertOne` into `jokes` with `setup`, `punchline`, `typeName`.
12. **Type update event:** If `loadJoke` returns `wasNewType`, ETL publishes to fanout exchange **type_update** with `{ type: String(type).trim() }` (persistent). File: `services/etl/server.js` – `ch.publish(TYPE_UPDATE_EXCHANGE, '', Buffer.from(JSON.stringify({ type: ... })), { persistent: true })`.
13. **Joke retrieval:** User opens `/app/joke` or calls GET `/joke/:type?count`. Kong forwards to joke service (10.1.1.4:3000). `services/joke/server.js` – `GET /joke/:type` calls `getJokesByType(type, count)` from `services/joke/db/mysql.js` or `mongo.js` (random rows, by type or any), returns JSON. GET `/types` returns list of type names from DB.

**Summary table**

| Step | Service | Endpoint / Queue | File | Key function |
|------|---------|------------------|------|---------------|
| Enter | Kong | /submit (proxy) | gateway/kong-azure.example.yml | route to submit-service |
| Handle submit | Submit | POST /submit | services/submit/server.js | publishSubmit() |
| Produce | Submit | queue: submit | services/submit/queue.js | publishSubmit(), sendToQueue |
| Consume (on demand) | Moderate | GET /moderate | services/moderate/queue.js | getOneFromSubmit(), ch.get, ack |
| Produce | Moderate | POST /moderated → queue: moderated | services/moderate/queue.js | publishModerated() |
| Consume | ETL | queue: moderated | services/etl/server.js | ch.consume, loadJoke() |
| Write DB | ETL | — | services/etl/db/mysql.js or mongo.js | loadJoke() |
| Retrieve | Joke | GET /joke/:type, GET /types | services/joke/server.js, db/*.js | getJokesByType(), getTypes() |

---

## 3. RabbitMQ Messaging Implementation

**Connection creation**

- **Submit:** `services/submit/queue.js` – `getChannel()`: `amqp.connect(url)`, `connection.createChannel()`, `channel.assertQueue(QUEUE, { durable: true })`. Single connection/channel reused. URL: `process.env.RABBITMQ_URL`.
- **Moderate:** `services/moderate/queue.js` – same pattern: `getChannel()`, assert **submit** and **moderated** queues (both durable).
- **ETL:** `services/etl/server.js` – `runConsumer()`: `amqp.connect(RABBITMQ_URL)`, `createChannel()`, `assertQueue(MODERATED_QUEUE, { durable: true })`, `assertExchange(TYPE_UPDATE_EXCHANGE, 'fanout', { durable: true })`.
- **Type_update subscribers:** `services/moderate/typeUpdateConsumer.js` and `services/submit/typeUpdateConsumer.js` – each creates its own connection, channel, asserts fanout exchange and a **durable** queue, binds queue to exchange, then `ch.consume(...)`.

**Producers**

| Producer file | Producer function | Queue / Exchange | Message format |
|---------------|-------------------|------------------|----------------|
| services/submit/queue.js | publishSubmit(payload) | Queue: submit | JSON { setup, punchline, type }, persistent: true |
| services/moderate/queue.js | publishModerated(payload) | Queue: moderated | JSON { setup, punchline, type }, persistent: true |
| services/etl/server.js | ch.publish(...) | Exchange: type_update (fanout) | JSON { type: string }, persistent: true |

**Consumers**

| Consumer file | Consumer function | Queue | Processing |
|---------------|-------------------|-------|------------|
| services/moderate/queue.js | getOneFromSubmit() | submit | On-demand: ch.get(), parse JSON, ack (or nack false, false on parse error). Removes one message per GET /moderate. |
| services/etl/server.js | ch.consume(MODERATED_QUEUE, callback) | moderated | Parse JSON, loadJoke(), if wasNewType publish type_update, ack; on error nack(msg, false, true) (requeue). prefetch(1). |
| services/moderate/typeUpdateConsumer.js | startTypeUpdateConsumer() | mod_type_update (bound to type_update) | Parse payload.type, addType(typeName) to file cache, ack; nack(msg, false, true) on error. |
| services/submit/typeUpdateConsumer.js | startTypeUpdateConsumer() | sub_type_update (bound to type_update) | Same: addType(), ack; nack requeue on error. |

**Acknowledgment and persistence**

- Queues and type_update exchange are declared **durable: true**. Messages are published with **persistent: true**.
- All consumers use **noAck: false**; ETL and type_update consumers ack on success, nack on failure (ETL and type_update use requeue true for retry).
- Moderate’s getOneFromSubmit: ack after successful parse; nack(msg, false, false) on parse error (drop message).

---

## 4. Moderate Microservice Implementation

**Moderation UI**

- Static UI: `services/moderate/public/index.html` and `services/moderate/public/app.js`. SPA: “Next” fetches one joke (GET /moderate), form shows setup/punchline/type; user can edit and “Approve” (POST /moderated) or “Next” to skip (no re-queue in this design; message is acked and removed).
- **Polling:** When there is no joke shown (form hidden), UI polls every `POLL_MS = 1000` via setInterval calling fetchNext() so a new joke appears when one is available. File: `services/moderate/public/app.js` – `startPolling()`.

**Endpoints**

| Method | Path | Purpose | File |
|--------|------|---------|------|
| GET | /health | Always 200 for Kong | services/moderate/server.js |
| GET | /moderate/auth/status | Returns { oidc: boolean } | services/moderate/server.js |
| GET | /moderate | One joke from submit queue or { noJoke: true } | services/moderate/server.js – getOneFromSubmit() |
| POST | /moderated | Body { setup, punchline, type } → publish to moderated queue | services/moderate/server.js – publishModerated() |
| GET | /moderate/types | Types from file cache | services/moderate/server.js – readCache from typesCache |
| GET | /, /app/moderate | Serve index.html | services/moderate/server.js |
| /login, /logout, /callback | OIDC routes when OIDC enabled | express-openid-connect | services/moderate/server.js |

**Queue consumer (on-demand)**

- Not a long-running consumer. GET /moderate calls `getOneFromSubmit()` in `services/moderate/queue.js`: `ch.get(SUBMIT_QUEUE, { noAck: false })`, parse, `ch.ack(msg)`, return payload; if no message, returns null (API returns { noJoke: true }).

**Queue producer**

- POST /moderated calls `publishModerated(payload)` in `services/moderate/queue.js`: `sendToQueue(MODERATED_QUEUE, Buffer.from(JSON.stringify(payload)), { persistent: true })`.

**UI files**

- `services/moderate/public/index.html`, `services/moderate/public/app.js` (load types from /moderate/types, fetch next from /moderate, submit approved joke to /moderated, handle 401 for OIDC redirect to login).

---

## 5. ETL Service Implementation

**Where messages are consumed**

- `services/etl/server.js` – `runConsumer()`: asserts queue **moderated** (durable), asserts exchange **type_update** (fanout, durable), prefetch(1), then `ch.consume(MODERATED_QUEUE, async (msg) => { ... }, { noAck: false })`.

**Transform**

- In the consumer: parse JSON to `{ setup, punchline, type }`; validate presence; call `loadJoke({ setup, punchline, type })` from `services/etl/db/index.js`, which delegates to `services/etl/db/mysql.js` or `services/etl/db/mongo.js`. No separate “transform” step; normalization is inside the DB layer (type name trim, insert type if not exists, then insert joke).

**Write to database**

- **MySQL** (`services/etl/db/mysql.js`): `loadJoke()` – `SELECT id FROM types WHERE name = ?`; if no row, `wasNewType = true`. `INSERT IGNORE INTO types (name)`, then `SELECT id FROM types WHERE name = ?`, then `INSERT INTO jokes (type_id, setup, punchline)`. Returns `{ wasNewType }`.
- **Mongo** (`services/etl/db/mongo.js`): `loadJoke()` – `findOneAndUpdate` on collection `types` with upsert; `returnDocument: 'before'` so if document was inserted, result is null → `wasNewType = true`. Then `insertOne` into `jokes` with `setup`, `punchline`, `typeName`. Returns `{ wasNewType }`.

**Files and functions**

- `services/etl/server.js`: `runConsumer()`, HTTP server for /alive; on startup `initSchema()` then `runConsumer()`.
- `services/etl/db/index.js`: factory by `DB_TYPE` (mysql vs mongo), exports initSchema, loadJoke.
- `services/etl/db/mysql.js`: initSchema (CREATE TABLE types, jokes), loadJoke (type upsert + joke insert).
- `services/etl/db/mongo.js`: initSchema (createIndex on types.name, jokes.typeName), loadJoke (upsert type, insertOne joke).

---

## 6. Event Carried State Transfer (type_update events)

**Producer**

- **File:** `services/etl/server.js`. **Trigger:** After successfully writing a joke in `loadJoke()`, when `wasNewType` is true. **Data:** `{ type: String(type).trim() }`. **Mechanism:** `ch.publish(TYPE_UPDATE_EXCHANGE, '', Buffer.from(JSON.stringify({ type: ... })), { persistent: true })`. Exchange is **type_update**, fanout, durable.

**Subscribers**

- **Moderate:** `services/moderate/typeUpdateConsumer.js` – `startTypeUpdateConsumer()`: asserts exchange type_update (fanout), queue **mod_type_update** (durable), bind queue to exchange, consume with callback that parses payload and calls `addType(typeName)` from `services/moderate/typesCache.js`; ack on success, nack requeue on error.
- **Submit:** `services/submit/typeUpdateConsumer.js` – same pattern, queue **sub_type_update**, same exchange; callback calls `addType(typeName)` from `services/submit/typesCache.js`.

**Cache update logic**

- `addType(typeName)` in both typesCache modules: read cache file (JSON array), if name not in array push and sort, write back. Prevents duplicate types and keeps list sorted.

**How type cache is stored**

- **File cache** on disk. Path: `process.env.TYPES_CACHE_PATH` or default `../data/types.json` (relative to service). On Azure, deploy composes mount a **Docker volume** (e.g. moderate_vol, submit_vol) at `/data` and set `TYPES_CACHE_PATH: /data/types.json`, so the cache survives container restarts. Not in-memory only; read/write on every addType and on every GET /moderate/types or GET /types.

---

## 7. Database Layer

**MySQL schema**

- **Tables:** `types` (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE), `jokes` (id INT AUTO_INCREMENT PRIMARY KEY, type_id INT NOT NULL, setup TEXT NOT NULL, punchline TEXT NOT NULL, FOREIGN KEY (type_id) REFERENCES types(id)). Created in joke and ETL adapters with `CREATE TABLE IF NOT EXISTS`. File: `services/joke/db/mysql.js`, `services/etl/db/mysql.js`.

**MongoDB schema**

- **Collections:** `types` – documents `{ name: string }`, unique index on `name`. `jokes` – documents `{ setup, punchline, typeName }`, index on `typeName`. Same layout in joke and ETL. Files: `services/joke/db/mongo.js`, `services/etl/db/mongo.js` (and ETL mongo uses findOneAndUpdate for type upsert, insertOne for joke).

**Switching between MySQL and Mongo**

- **Env:** `DB_TYPE` (e.g. `mysql` or `mongo`). For Mongo, `MONGO_URI` can be set (e.g. `mongodb://mongo:27017/jokedb`); otherwise build from `DB_HOST`, `DB_PORT`, `DB_NAME`. **Config logic:** `services/joke/db/index.js` and `services/etl/db/index.js`: `const dbType = (process.env.DB_TYPE || 'mysql').toLowerCase(); module.exports = dbType === 'mongo' || dbType === 'mongodb' ? require('./mongo') : require('./mysql');`. So one adapter is loaded at startup. **Conditional paths:** No branching inside business logic; the same interface (initSchema, loadJoke / getTypes, getJokesByType, seedIfEmpty) is implemented in both mysql.js and mongo.js.

---

## 8. API Gateway Implementation

**Kong configuration**

- **Azure config file:** `gateway/kong-azure.example.yml`. Declarative, DB-less. **Routes:**
  - **joke-service** (url http://10.1.1.4:3000): paths /app/joke (strip_path), /joke and /joke/ (no strip), /types (no strip). Plugin **rate-limiting** on joke-api: minute: 5, policy: local.
  - **submit-service** (url http://10.2.1.5:3200): /app/submit (strip), /submit (no strip), /submit/types (no strip), /docs (no strip).
  - **moderate-service** (url http://10.2.1.4:3100): /app/moderate/callback, /login, /logout with request-transformer to replace URI to /callback, /login, /logout; /app/moderate and /app/moderate/ with strip_path; /moderate, /moderated, /moderate/types no strip.

**Config files**

- `gateway/kong-azure.example.yml` (used on Azure; CD downloads as kong.yml). Local: `gateway/kong.yml` (same structure, different upstream IPs for local Docker).
- Kong runs from `deploy/kong/docker-compose-le-nginx.yml`: Kong container mounts kong.yml, listens 8000; no direct TLS in Kong when nginx is used.

**Plugins**

- **rate-limiting** on joke-api only (5 per minute, local policy). **request-transformer** on moderate OIDC routes to rewrite URI so upstream receives /callback, /login, /logout.

**TLS**

- Not in Kong when using nginx. **Nginx** (`deploy/kong/nginx-ssl.conf`) listens 80 and 443; 443 uses `ssl_certificate` and `ssl_certificate_key` (Let's Encrypt cert in ./certs). Nginx proxies to `http://kong:8000`. Compose maps host 8443 to container 443. So TLS is terminated at Nginx; Kong sees HTTP.

---

## 9. System Resilience Mechanisms

- **Persistent queues:** All RabbitMQ queues and type_update exchange are durable; messages are persistent. Survives broker restart. Code: assertQueue(..., { durable: true }), sendToQueue(..., { persistent: true }).
- **Joke service DB retry:** `services/joke/server.js` – `tryDbInit()` runs initSchema and seedIfEmpty in a loop with 2s delay on failure so the service survives MySQL not being ready at first boot (e.g. Azure VM). Server listens immediately so Kong gets 200 on /health and no connection refused; /joke and /types return 503 “Database not ready yet” until dbReady is true.
- **Moderate/Submit bootstrap:** On startup, moderate and submit call `bootstrapFromJoke(JOKE_SERVICE_URL)` to fetch GET /types from the joke service and write to the types file cache so cache matches DB after restart or DB switch. Failures are logged, not fatal. Files: `services/moderate/typesCache.js`, `services/submit/typesCache.js` – `bootstrapFromJoke()`.
- **ETL nack requeue:** On processing error, ETL does `ch.nack(msg, false, true)` so the message is requeued. File: `services/etl/server.js`.
- **Type_update consumers:** Same nack requeue on error in moderate and submit type_update consumers.
- **File cache for types:** Submit and moderate do not depend on joke service for types at request time; they use a file cache updated by type_update events (and bootstrap at startup), so temporary joke unavailability does not break type dropdowns.
- **Global error handler (moderate):** `services/moderate/server.js` – express error handler sends 500 JSON so Kong never sees an invalid response and can return a proper 500 to the client.

---

## 10. Authentication for Moderator

- **Identity provider:** External OIDC (e.g. Auth0). Configured via env: `OIDC_ISSUER_BASE_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_SECRET`, `OIDC_BASE_URL` (app base URL for callback). When these are set, moderate service enables auth.
- **Where configured:** `services/moderate/server.js` – if `oidcSecret && OIDC_ISSUER_BASE_URL && OIDC_BASE_URL && OIDC_CLIENT_ID`, it uses `express-openid-connect` `auth()` middleware with authRequired: true. Routes /login and /logout delegate to `res.oidc.login()` and `res.oidc.logout()`. Callback path is /callback; Kong request-transformer rewrites /app/moderate/callback to /callback so the IdP redirect lands correctly.
- **Token validation:** Handled by express-openid-connect (validates ID token, session). No custom JWT validation in repo.
- **Protected routes:** With OIDC enabled, all routes under the middleware require authentication except /health and /moderate/auth/status. GET /moderate, POST /moderated, GET /moderate/types, and static UI are behind auth.
- **Middleware:** `auth({ ... })` from `express-openid-connect`. No separate middleware file; configuration is inline in server.js. OIDC_BASE_URL must use the same origin as the browser (FQDN + HTTPS) so the state cookie is sent on callback (avoids “checks.state argument is missing”).

---

## 11. Terraform Infrastructure

**Files**

- `terraform/main.tf` – resource group, VNets, subnets, NSGs, public IPs (Kong, Submit), NICs, VMs, CustomScript extensions.
- `terraform/variables.tf` – subscription_id, repo_url, prefix, admin_username, admin_ssh_public_key_path, vm_size, regions, kong_domain_name_label, certbot_email, etc.
- `terraform/outputs.tf` – resource_group, kong_public_ip, kong_fqdn, submit_public_ip, private_ips, regions.

**Resources**

- 1 resource group, 3 VNets (gateway 10.0.0.0/16, joke 10.1.0.0/16, apps 10.2.0.0/16), subnets, 6 NSG rules (HTTP, SSH, HTTPS 8443, keycloak 8080 on gateway; SSH on submit), 2 public IPs (Kong, Submit), 5 NICs with static private IPs, 5 Linux VMs (Ubuntu 22.04), 6 VNet peerings (bidirectional between each pair), 5 CustomScript extensions (one per VM).

**Provisioners**

- No classic provisioners. **CustomScript extension** (`azurerm_virtual_machine_extension`): each VM runs a single script that installs Docker (curl get.docker.com), then for Kong writes kong.yml and compose (and optionally runs certbot and uses LE compose), for RabbitMQ writes compose and runs it, for Joke/Moderate/Submit clones repo (when repo_url set), writes deploy compose into app directory, runs `docker compose up -d --build` in background (nohup) so the extension can finish within Azure timeout. Compose content is embedded as base64 in Terraform (file() of deploy/*.yml).

**Deployment flow**

- terraform apply → VMs created → CustomScript runs → Docker installed → Compose files written and started. App VMs need repo_url to clone and run app; Kong gets kong.yml from Terraform; RabbitMQ gets only compose. Later, CD (GitHub Actions) updates app VMs by git pull and docker compose up -d --build and updates Kong VM by downloading compose and kong.yml from GitHub and running docker compose up -d.

---

## 12. Continuous Deployment Pipeline

**Location:** `.github/workflows/cd.yml` (name: cd-azure). Trigger: push to main. Runs on: self-hosted runner with label `azure` (typically on Submit VM).

**Steps (summary)**

1. Checkout repo.
2. Log in to GHCR (docker/login-action).
3. Build and push moderate image: `docker build -t ghcr.io/<owner>/distributed-jokes-moderate:latest services/moderate`, `docker push`.
4. Azure login via Managed Identity (`az login --identity`); optional subscription set from secret.
5. Get Kong public IP and FQDN (az network public-ip list/show) for OIDC base URL.
6. Update Kong VM: download compose (and nginx conf if certs exist) and kong.yml from GitHub raw, then `docker compose up -d`; retry loop; then ensure-Kong-up step (sleep, compose up again, curl check).
7. Trigger redeploy on app VMs: for each of Joke, Moderate, Submit run `az vm run-command invoke` with a script that does `cd /home/azureuser/app`, git pull (and for moderate exports OIDC_* and JOKE_IP, RABBITMQ_IP; for submit/joke same env pattern), then `cd deploy/<joke|moderate|submit>` and `docker compose up -d --build`. Moderate gets OIDC_BASE_URL from Kong FQDN (HTTPS) or Kong IP (HTTP). Scripts run in parallel; exit code is OR of the three.

**Docker images**

- Built on the runner: only **moderate** is built and pushed to GHCR in this workflow. Joke and Submit are built on their respective VMs from the cloned repo (docker compose up -d --build). So deployment is repo-based on VMs, not full image registry for all services.

**Deployment commands (on VMs)**

- Kong: curl compose and kong.yml to /home/azureuser/kong, then docker compose up -d.
- Joke: git pull, RABBITMQ_IP=10.0.1.5 docker compose up -d --build in deploy/joke.
- Moderate: git pull, export JOKE_IP RABBITMQ_IP OIDC_* then docker compose up -d --build in deploy/moderate.
- Submit: git pull, JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5 docker compose up -d --build in deploy/submit.

---

## 13. Docker Architecture

**Compose files**

- **Root (local full stack):** `docker-compose.yml` – single bridge network 172.28.0.0/24, fixed IPs for mysql, mongo, rabbitmq, joke, etl, submit, moderate, kong. All services in one compose; Kong uses gateway/kong.yml with upstreams to 172.28.0.x. Volumes: mysql_vol, mongo_vol, rabbitmq_vol, submit_vol, moderate_vol.
- **Per-VM (Azure):** `deploy/rabbitmq/docker-compose.yml` (rabbitmq only). `deploy/joke/docker-compose.yml` (mysql, mongo, joke, etl; RABBITMQ_IP; ports 3306, 27017, 3000). `deploy/moderate/docker-compose.yml` (moderate; JOKE_IP, RABBITMQ_IP, OIDC_*, TYPES_CACHE_PATH /data/types.json, moderate_vol). `deploy/submit/docker-compose.yml` (submit; JOKE_IP, RABBITMQ_IP, TYPES_CACHE_PATH /data/types.json, submit_vol). `deploy/kong/docker-compose-le-nginx.yml` (kong + nginx, kongnet, nginx ports 80 and 8443, certs and nginx-ssl.conf mounted).

**Container definitions**

- Each service has build context (e.g. ../../services/joke), image name (e.g. distributed-jokes-joke:latest), environment from env vars or literals, ports (host:container), volumes where needed (data, types cache), restart: unless-stopped. Joke and ETL depend_on mysql (and mongo in deploy/joke). Nginx depends_on kong.

**Volumes**

- Persistent: mysql_vol, mongo_vol, rabbitmq_vol, submit_vol, moderate_vol (and in deploy/joke: mysql_vol, mongo_vol). Types cache path on moderate/submit is inside a volume (/data) so types.json persists.

**Environment variables (key)**

- Joke/ETL: PORT, DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, MONGO_URI (for Mongo), RABBITMQ_URL, MODERATED_QUEUE, TYPE_UPDATE_EXCHANGE (ETL). Submit: PORT, JOKE_SERVICE_URL, RABBITMQ_URL, SUBMIT_QUEUE, TYPES_CACHE_PATH, TYPE_UPDATE_EXCHANGE, SUB_TYPE_UPDATE_QUEUE. Moderate: PORT, JOKE_SERVICE_URL, RABBITMQ_URL, SUBMIT_QUEUE, MODERATED_QUEUE, TYPES_CACHE_PATH, TYPE_UPDATE_EXCHANGE, MOD_TYPE_UPDATE_QUEUE, OIDC_*.

**How services are connected**

- Locally: one network; hostnames are service names. Azure: no shared Docker network across VMs; services reach each other by private IP (Kong to 10.1.1.4, 10.2.1.4, 10.2.1.5; Submit/Moderate to 10.1.1.4 and 10.0.1.5) and env vars set by Terraform/CD.

---

## 14. Key Technical Challenges

**RabbitMQ connection handling**

- Single channel/connection per process, lazy-created in getChannel(). No reconnection logic in the repo; if the connection drops, the next publish/get would fail. Design assumes stable broker and short-lived runs or restarts. Prefetch(1) in ETL limits in-flight messages.

**Container networking (Azure)**

- Joke VM: joke and ETL must be on the same Docker network as mysql/mongo so hostname `mysql` and `mongo` resolve. If compose was updated and one container left on an old network, joke could get ECONNREFUSED to MySQL (different network). Fix: run full compose down then up so all share the same default network. Doc: DEBUG_502.md, conversation.

**Queue synchronization**

- Submit queue is consumed on-demand by moderate (getOneFromSubmit). Only one moderate instance should consume so messages aren’t duplicated; multiple moderators would compete via ch.get. No explicit locking; single consumer per queue in practice.

**Cache updates (type_update)**

- File cache is per container; two containers (e.g. two moderate replicas) would have separate files. Repo runs one instance per VM. type_update is fanout so every subscriber gets the event; each updates its own file. No distributed lock.

**Authentication integration**

- OIDC callback must use the same origin as the browser (FQDN + HTTPS). If Kong/CD set OIDC_BASE_URL to HTTP or to IP, Auth0 redirected to that URL and the state cookie (set on FQDN) was not sent → “checks.state argument is missing”. Fix: set OIDC_BASE_URL to https://<kong-fqdn>:8443/app/moderate in CD and in Auth0 allowed callback URLs. Code: .github/workflows/cd.yml (KONG_FQDN, OIDC_BASE_URL), services/moderate/server.js (baseURL, returnTo).

**Terraform deployment**

- Single CustomScript per VM; script must install Docker, write compose, and start containers. Long-running compose up can hit Azure script timeout; repo uses nohup and sleep 3 for app VMs so the extension completes. Kong VM runs compose synchronously (no nohup) and has 30m timeout. Doc: main.tf comments, SELF_HOSTED_RUNNER_SETUP.md.

**Kong default cert / TLS**

- Kong 3.x with SSL was serving its default cert instead of Let’s Encrypt in some setups. Workaround: put Nginx in front of Kong for TLS (docker-compose-le-nginx.yml), Kong listens HTTP 8000 only. Nginx uses certs from host (certbot) and proxies to Kong. Doc: deploy/kong/nginx-ssl.conf, scripts/kong-push-le-nginx.sh.

---

## 15. Code Sections Worth Showing in the Demo

| File | Function / Section | Why important |
|------|-------------------|----------------|
| gateway/kong-azure.example.yml | Full file or routes block | Shows single entry point, path-based routing to three backends, rate limit on joke, request-transformer for OIDC paths. |
| services/submit/queue.js | publishSubmit(), getChannel(), sendToQueue with persistent: true | Producer: durable queue, persistent message. |
| services/moderate/queue.js | getOneFromSubmit() (ch.get, ack), publishModerated() | On-demand consumer and producer; ack/nack. |
| services/etl/server.js | runConsumer(), ch.consume, loadJoke(), ch.publish type_update | ETL pipeline: consume moderated, write DB, event on new type. |
| services/etl/db/index.js | dbType check, require('./mysql') or require('./mongo') | Single switch for DB backend by env. |
| services/joke/server.js | tryDbInit(), dbReady, 503 until ready | Resilience: server up immediately, DB retry in background. |
| services/moderate/typesCache.js | addType(), readCache(), writeCache(), bootstrapFromJoke() | Event-driven cache update and startup sync. |
| services/moderate/server.js | auth() from express-openid-connect, oidcBasePath, getOneFromSubmit, publishModerated | Auth wrapping API and queue integration. |
| services/moderate/public/app.js | fetchNext(), startPolling(), POST /moderated | UI: polling for next joke, approve flow. |
| terraform/main.tf | VNet peering (e.g. gateway_to_joke, joke_to_gateway), CustomScript commandToExecute (joke_script) | Cross-region networking and bootstrap of app from repo. |
| .github/workflows/cd.yml | Get KONG_FQDN, MOD_SCRIPT with OIDC_BASE_URL, run_one for each VM | CD: FQDN for OIDC, parallel VM redeploy. |

---

## Summary – Must-Mention Technical Elements for the Demo

1. **Single entry point:** Kong (and Nginx for TLS) as the only public endpoint; path-based routing to joke, submit, moderate by private IP.
2. **Two queues:** **submit** (user → moderate) and **moderated** (moderate → ETL); both durable and persistent; moderate consumes submit on-demand (get one per GET /moderate).
3. **Event-driven type sync:** ETL publishes to **type_update** fanout when a new type is added; Submit and Moderate subscribe with their own queues and update a **file cache** (types.json) so UIs get types without calling the joke service on every request.
4. **Dual database:** MySQL and MongoDB with the same logical schema; switch via **DB_TYPE** and **MONGO_URI**; single adapter interface in joke and ETL (index.js chooses mysql or mongo).
5. **Resilience:** Durable/persistent queues; joke service retries DB init in background and returns 503 until ready; ETL and type_update consumers nack with requeue on error; bootstrap of types cache from joke service on startup.
6. **Moderator auth:** OIDC (e.g. Auth0) with **OIDC_BASE_URL** set to the same origin as the browser (HTTPS FQDN) so callback and state cookie work; Kong rewrites /app/moderate/callback to /callback.
7. **Infrastructure:** Terraform for 5 VMs in 3 regions, 3 VNets with peering, static private IPs, CustomScript to install Docker and run compose; CD (GitHub Actions on self-hosted runner) updates Kong and app VMs with git pull and docker compose.
8. **TLS:** Nginx in front of Kong with Let's Encrypt cert (certbot on Kong VM); Kong listens HTTP only to avoid default-cert issues.
