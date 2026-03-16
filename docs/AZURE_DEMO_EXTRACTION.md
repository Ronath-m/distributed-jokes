# Azure Demo Extraction – Cloud-Hosted Deployment Only

Exact implementation details for the Azure-hosted demo. No local development. All commands and endpoints assume deployment on Azure VMs (resource group `jokes-rg`, default prefix `jokes`).

---

## 1. Azure Infrastructure Overview

**Get VM names and IPs (run from your machine with Azure CLI):**
```bash
az vm list -g jokes-rg -d --query "[].{name:name, ip:publicIps}" -o table
terraform -chdir=terraform output private_ips
```

| VM Name | Purpose | Containers running on it |
|---------|---------|---------------------------|
| **jokes-kong-vm** | API gateway + TLS termination | kong-kong-1, kong-nginx-1 |
| **jokes-rabbitmq-vm** | Message broker | rabbitmq-rabbitmq-1 |
| **jokes-submit-vm** | Submit microservice + GitHub Actions runner | submit-submit-1 |
| **jokes-moderate-vm** | Moderation microservice | moderate-moderate-1 |
| **jokes-joke-vm** | Joke API, ETL, and databases | joke-mysql-1, joke-mongo-1, joke-joke-1, joke-etl-1 |

**Private IPs (from Terraform):** Kong 10.0.1.4, RabbitMQ 10.0.1.5, Joke 10.1.1.4, Moderate 10.2.1.4, Submit 10.2.1.5.

---

## 2. Azure Public Endpoints

**Get gateway and submit IP/FQDN:**
```bash
terraform -chdir=terraform output kong_public_ip
terraform -chdir=terraform output kong_fqdn
terraform -chdir=terraform output submit_public_ip
```

| Endpoint | URL (replace with your Kong FQDN or IP) |
|----------|----------------------------------------|
| **Gateway API / UIs (HTTPS)** | `https://<kong_fqdn>:8443` e.g. `https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443` |
| **Submit UI** | `https://<kong_fqdn>:8443/app/submit` |
| **Moderation UI** | `https://<kong_fqdn>:8443/app/moderate` |
| **Joke UI** | `https://<kong_fqdn>:8443/app/joke` |
| **RabbitMQ management** | No public IP. Use SSH tunnel from Submit VM: `ssh -L 15672:10.0.1.5:15672 azureuser@<submit_public_ip>` then open `http://localhost:15672` (guest/guest). |

If you only have Kong public IP (no FQDN), use HTTP and port 80:
- Gateway: `http://<kong_public_ip>`
- Submit UI: `http://<kong_public_ip>/app/submit`
- Moderation UI: `http://<kong_public_ip>/app/moderate`

---

## 3. SSH Commands for Each VM

Only **Kong** and **Submit** have public IPs. Get IPs first:
```bash
KONG_IP=$(az vm list-ip-addresses -g jokes-rg -n jokes-kong-vm --query "[0].virtualMachine.network.publicIpAddresses[0].ipAddress" -o tsv)
SUBMIT_IP=$(az vm list-ip-addresses -g jokes-rg -n jokes-submit-vm --query "[0].virtualMachine.network.publicIpAddresses[0].ipAddress" -o tsv)
```

| VM | SSH command |
|----|--------------|
| **Kong VM** | `ssh azureuser@<KONG_IP>` |
| **Submit VM** | `ssh azureuser@<SUBMIT_IP>` |
| **RabbitMQ VM** | No public IP. From Submit VM: `ssh azureuser@10.0.1.5` (if peering and SSH allow). |
| **Moderate VM** | No public IP. From Submit VM: `ssh azureuser@10.2.1.4` (if allowed). |
| **Joke VM** | No public IP. From Submit VM: `ssh azureuser@10.1.1.4` (if allowed). |

Use your SSH key if required: `ssh -i ~/.ssh/id_rsa azureuser@<IP>`.

---

## 4. Docker Commands Used on Azure

**List containers (per VM):**
```bash
# From your machine (run-command on each VM)
az vm run-command invoke -g jokes-rg -n jokes-kong-vm --command-id RunShellScript --scripts 'docker ps -a'
az vm run-command invoke -g jokes-rg -n jokes-rabbitmq-vm --command-id RunShellScript --scripts 'docker ps -a'
az vm run-command invoke -g jokes-rg -n jokes-submit-vm --command-id RunShellScript --scripts 'docker ps -a'
az vm run-command invoke -g jokes-rg -n jokes-moderate-vm --command-id RunShellScript --scripts 'docker ps -a'
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'docker ps -a'
```

**Short form (list with names/status):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'docker ps -a --format "table {{.Names}}\t{{.Status}}"'
```

**Stop joke service container (on Joke VM):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'docker stop joke-joke-1'
```

**Restart joke container:**
```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'docker restart joke-joke-1'
```

**Inspect logs (last 50 lines):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'docker logs joke-joke-1 --tail 50'
```

**Actual container names (by VM):**

| VM | Container names |
|----|-----------------|
| Kong | kong-kong-1, kong-nginx-1 |
| RabbitMQ | rabbitmq-rabbitmq-1 |
| Submit | submit-submit-1 |
| Moderate | moderate-moderate-1 |
| Joke | joke-mysql-1, joke-mongo-1, joke-joke-1, joke-etl-1 |

---

## 5. RabbitMQ Queues Used

| Name | Type | Purpose |
|------|------|---------|
| **submit** | Queue | User-submitted jokes (Submit → Moderate) |
| **moderated** | Queue | Approved jokes (Moderate → ETL) |
| **type_update** | Exchange (fanout) | New joke type added (ETL → subscribers) |
| **mod_type_update** | Queue | Moderate service’s queue bound to type_update |
| **sub_type_update** | Queue | Submit service’s queue bound to type_update |

**Where declared:**
- **submit:** `services/submit/queue.js` (assertQueue), `services/moderate/queue.js` (assertQueue)
- **moderated:** `services/moderate/queue.js` (assertQueue), `services/etl/server.js` (assertQueue)
- **type_update exchange:** `services/etl/server.js` (assertExchange), `services/moderate/typeUpdateConsumer.js` (assertExchange), `services/submit/typeUpdateConsumer.js` (assertExchange)
- **mod_type_update:** `services/moderate/typeUpdateConsumer.js` (assertQueue, bindQueue)
- **sub_type_update:** `services/submit/typeUpdateConsumer.js` (assertQueue, bindQueue)

---

## 6. Submit Service Event Producer Code

**File:** `services/submit/queue.js`  
**Function:** `publishSubmit`

```javascript
const QUEUE = process.env.SUBMIT_QUEUE || 'submit';

async function publishSubmit(payload) {
  const ch = await getChannel();
  const ok = ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
  });
  if (!ok) throw new Error('Queue full or unavailable');
}
```

**What it does:** Takes a joke payload `{ setup, punchline, type }`, ensures a channel and the durable `submit` queue exist, and publishes the JSON to the queue with `persistent: true`. Used when the user submits a joke via POST /submit.

---

## 7. Moderate Service Queue Consumer

**File:** `services/moderate/queue.js`  
**Function:** `getOneFromSubmit`

```javascript
async function getOneFromSubmit() {
  const ch = await getChannel();
  const msg = await ch.get(SUBMIT_QUEUE, { noAck: false });
  if (!msg) return null;
  try {
    const payload = JSON.parse(msg.content.toString());
    ch.ack(msg);
    return payload;
  } catch (e) {
    ch.nack(msg, false, false);
    return null;
  }
}
```

**How it works:** On each GET /moderate the service calls `getOneFromSubmit()`. It uses `ch.get(SUBMIT_QUEUE, { noAck: false })` to take a single message from the submit queue (on-demand, not a long-lived consumer). It parses the JSON, acks the message (removing it from the queue), and returns the payload. On parse error it nacks without requeue. If no message is available, it returns null and the API returns `{ noJoke: true }`.

---

## 8. Moderated Event Producer

**File:** `services/moderate/queue.js`  
**Function:** `publishModerated`

```javascript
async function publishModerated(payload) {
  const ch = await getChannel();
  const ok = ch.sendToQueue(MODERATED_QUEUE, Buffer.from(JSON.stringify(payload)), { persistent: true });
  if (!ok) throw new Error('Moderated queue full');
}
```

**Moderated event structure:** JSON body `{ setup, punchline, type }` (strings). Same shape as submit; moderator can edit before approving. Sent to the durable queue `moderated` with `persistent: true`.

---

## 9. ETL Queue Consumer

**File:** `services/etl/server.js`  
**Function:** `runConsumer` (and the callback passed to `ch.consume`)

```javascript
ch.consume(MODERATED_QUEUE, async (msg) => {
  if (!msg) return;
  try {
    const payload = JSON.parse(msg.content.toString());
    const { setup, punchline, type } = payload;
    if (!setup || !punchline || !type) {
      ch.nack(msg, false, false);
      return;
    }
    const { wasNewType } = await loadJoke({ setup, punchline, type });
    console.log('Loaded joke into DB:', type);
    if (wasNewType) {
      ch.publish(TYPE_UPDATE_EXCHANGE, '', Buffer.from(JSON.stringify({ type: String(type).trim() })), { persistent: true });
      console.log('Published type_update:', type);
    }
    ch.ack(msg);
  } catch (err) {
    console.error('ETL process error:', err);
    ch.nack(msg, false, true);
  }
}, { noAck: false });
```

**Transform:** No separate transform step. Payload is validated (setup, punchline, type required); type is trimmed. The DB layer ensures the type exists (insert if new) and inserts the joke.

**Database insert:** Handled by `loadJoke()` from `services/etl/db/index.js`, which delegates to `services/etl/db/mysql.js` or `services/etl/db/mongo.js`. MySQL: INSERT IGNORE into types, then INSERT into jokes with type_id. Mongo: findOneAndUpdate types (upsert), then insertOne into jokes with setup, punchline, typeName.

---

## 10. Type Update Event Producer

**File:** `services/etl/server.js`  
**Function:** Inside the ETL consume callback (see section 9)

```javascript
if (wasNewType) {
  ch.publish(TYPE_UPDATE_EXCHANGE, '', Buffer.from(JSON.stringify({ type: String(type).trim() })), { persistent: true });
  console.log('Published type_update:', type);
}
```

**When it runs:** After ETL successfully writes a joke with `loadJoke()`. If the type did not exist before (`wasNewType === true`), ETL publishes one message to the fanout exchange `type_update` with body `{ type: "<typeName>" }` so Submit and Moderate can update their type caches.

---

## 11. Type Update Subscriber

**Files:**  
- `services/moderate/typeUpdateConsumer.js` – function `startTypeUpdateConsumer`  
- `services/submit/typeUpdateConsumer.js` – function `startTypeUpdateConsumer`

**Snippet (moderate):**
```javascript
async function startTypeUpdateConsumer() {
  const conn = await amqp.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(TYPE_UPDATE_EXCHANGE, 'fanout', { durable: true });
  await ch.assertQueue(MOD_TYPE_UPDATE_QUEUE, { durable: true });
  await ch.bindQueue(MOD_TYPE_UPDATE_QUEUE, TYPE_UPDATE_EXCHANGE, '');
  ch.consume(MOD_TYPE_UPDATE_QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      const typeName = payload.type || payload;
      await addType(typeName);
      ch.ack(msg);
    } catch (e) {
      ch.nack(msg, false, true);
    }
  }, { noAck: false });
  console.log('Moderate subscribed to type_update');
}
```

**How the local cache is updated:** Each message carries `{ type: "<name>" }`. The consumer calls `addType(typeName)` from `typesCache.js`, which reads the types file, appends the new type if not present, sorts, and writes the file back.

---

## 12. Type Cache Implementation

**File:** `services/moderate/typesCache.js` (same pattern in `services/submit/typesCache.js`)

**Storage:** File on disk. Path from env `TYPES_CACHE_PATH` or default `../data/types.json`. On Azure, deploy sets `TYPES_CACHE_PATH: /data/types.json` with a Docker volume so it survives restarts.

**Load / update snippet:**
```javascript
const CACHE_PATH = process.env.TYPES_CACHE_PATH || path.join(__dirname, '..', 'data', 'types.json');

async function readCache() {
  try {
    const data = await fs.readFile(CACHE_PATH, 'utf8');
    const out = JSON.parse(data);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

async function addType(typeName) {
  const name = String(typeName || '').trim();
  if (!name) return;
  const types = await readCache();
  if (types.includes(name)) return;
  types.push(name);
  types.sort();
  await writeCache(types);
}
```

---

## 13. Kong API Gateway Configuration

**File:** `gateway/kong-azure.example.yml` (deployed on Kong VM as `kong.yml`)

**Routes snippet:**
```yaml
services:
  - name: joke-service
    url: http://10.1.1.4:3000
    routes:
      - name: joke-ui
        paths: [ /app/joke ]
        strip_path: true
      - name: joke-api
        paths: [ /joke, /joke/ ]
        strip_path: false
        plugins:
          - name: rate-limiting
            config: { minute: 5, policy: local }
      - name: types-route
        paths: [ /types ]
        strip_path: false

  - name: submit-service
    url: http://10.2.1.5:3200
    routes:
      - name: submit-ui
        paths: [ /app/submit ]
        strip_path: true
      - name: submit-api
        paths: [ /submit ]
        strip_path: false
      - name: submit-types
        paths: [ /submit/types ]
        strip_path: false
      - name: submit-docs
        paths: [ /docs ]
        strip_path: false

  - name: moderate-service
    url: http://10.2.1.4:3100
    routes:
      - name: moderate-callback
        paths: [ /app/moderate/callback ]
        ...
      - name: moderate-login
        paths: [ /app/moderate/login ]
        ...
      - name: moderate-logout
        paths: [ /app/moderate/logout ]
        ...
      - name: moderate-ui-root
        paths: [ /app/moderate ]
        strip_path: true
      - name: moderate-ui
        paths: [ /app/moderate/ ]
        strip_path: true
      - name: moderate-api
        paths: [ /moderate, /moderated, /moderate/types ]
        strip_path: false
```

**Mapping:**  
- `/app/joke`, `/joke`, `/joke/`, `/types` → joke-service (10.1.1.4:3000).  
- `/app/submit`, `/submit`, `/submit/types`, `/docs` → submit-service (10.2.1.5:3200).  
- `/app/moderate`, `/app/moderate/`, `/app/moderate/callback`, `/app/moderate/login`, `/app/moderate/logout`, `/moderate`, `/moderated`, `/moderate/types` → moderate-service (10.2.1.4:3100).

**Rate limiting:** On joke-api only: `rate-limiting` plugin, `minute: 5`, `policy: local`.

**TLS:** Not in Kong. Nginx in front (see `deploy/kong/nginx-ssl.conf`) terminates HTTPS on 8443 and proxies to Kong on 8000.

---

## 14. Database Switching Logic

**Files:** `services/joke/db/index.js`, `services/etl/db/index.js` (same pattern)

**Environment variable:** `DB_TYPE` (values `mysql` or `mongo`/`mongodb`). For Mongo, `MONGO_URI` can be set (e.g. on Azure `mongodb://mongo:27017/jokedb`).

**Code:**
```javascript
const dbType = (process.env.DB_TYPE || 'mysql').toLowerCase();

module.exports = dbType === 'mongo' || dbType === 'mongodb'
  ? require('./mongo')
  : require('./mysql');
```

**Adapter pattern:** One of two modules is required at startup. Both expose the same interface (e.g. initSchema, loadJoke for ETL; initSchema, seedIfEmpty, getTypes, getJokesByType for joke). No runtime branching on DB_TYPE in business code; the chosen adapter implements all DB operations.

---

## 15. Moderator Authentication Implementation

**File:** `services/moderate/server.js`  
**Library:** `express-openid-connect`

**Configuration snippet:**
```javascript
const oidcSecret = process.env.OIDC_CLIENT_SECRET;
const oidcEnabled = Boolean(oidcSecret && process.env.OIDC_ISSUER_BASE_URL && process.env.OIDC_BASE_URL && process.env.OIDC_CLIENT_ID);
if (oidcEnabled) {
  const { auth } = require('express-openid-connect');
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
```

**Protected routes:** When OIDC is enabled, the `auth()` middleware runs for all routes except `/health` and `/moderate/auth/status`. So GET /moderate, POST /moderated, GET /moderate/types, and the static UI require a valid session. Unauthenticated requests get a redirect to the IdP login; after login, IdP redirects to `OIDC_BASE_URL`/callback (Kong rewrites /app/moderate/callback to /callback).

---

## 16. Terraform Infrastructure Files

**Files:** `terraform/main.tf`, `terraform/variables.tf`, `terraform/outputs.tf`

**VM resource creation snippet (from main.tf):**
```hcl
resource "azurerm_linux_virtual_machine" "kong" {
  name                  = "${var.prefix}-kong-vm"
  resource_group_name   = azurerm_resource_group.rg.name
  location              = var.region_gateway
  size                  = local.vm_common.size
  admin_username        = local.vm_common.admin_username
  network_interface_ids = [azurerm_network_interface.kong_nic.id]

  admin_ssh_key {
    username   = local.vm_common.admin_username
    public_key = local.vm_common.admin_ssh_key.public_key
  }
  os_disk { ... }
  source_image_reference { ... }
}
```

(Similar blocks for `rabbitmq`, `joke`, `moderate`, `submit` with names `${var.prefix}-rabbitmq-vm`, etc.)

**Provisioning:** Each VM has one `azurerm_virtual_machine_extension` (CustomScript) that runs a script to install Docker and then write + run Docker Compose (compose content is base64-encoded from `deploy/*` files). App VMs clone the repo when `repo_url` is set and run `docker compose up -d --build` in the deploy directory. No separate provisioner block; everything is in the extension’s `commandToExecute`.

---

## 17. Continuous Deployment Pipeline

**File:** `.github/workflows/cd.yml` (workflow name: cd-azure)

**Trigger:** Push to branch `main`.

**Key steps:**
1. Checkout repo.
2. Log in to GitHub Container Registry (GHCR).
3. Build and push moderate image: `docker build -t ghcr.io/<owner>/distributed-jokes-moderate:latest services/moderate`, `docker push`.
4. Azure login with Managed Identity on the self-hosted runner (`az login --identity`).
5. Get Kong public IP and FQDN (for OIDC base URL).
6. Update Kong VM: download compose and kong.yml from GitHub raw, run `docker compose up -d` (with retries and a follow-up “ensure Kong up” step).
7. Redeploy app VMs in parallel via `az vm run-command invoke` for jokes-joke-vm, jokes-moderate-vm, jokes-submit-vm: each runs `cd /home/azureuser/app`, `git pull`, then `cd deploy/<joke|moderate|submit>` and `docker compose up -d --build` with the right env (JOKE_IP, RABBITMQ_IP, OIDC_* for moderate).

**How images are built and deployed:** The moderate image is built on the self-hosted runner and pushed to GHCR. Joke and Submit are not pushed; they are built on their VMs from the cloned repo when the run-command runs `docker compose up -d --build`. So only moderate uses a registry image; all three app VMs get code from `git pull` and local build.

---

## 18. Interesting or Complex Code Worth Showing in the Demo

| File | Function / part | Why it’s interesting |
|------|------------------|------------------------|
| `gateway/kong-azure.example.yml` | Full services/routes | Single entry point, path-based routing to three backends, rate limit on joke, OIDC path rewrites. |
| `services/submit/queue.js` | `publishSubmit` | Producer: durable queue, persistent message, one channel reused. |
| `services/moderate/queue.js` | `getOneFromSubmit` | On-demand consumer with `ch.get` and ack/nack; shows pull vs push consumption. |
| `services/moderate/queue.js` | `publishModerated` | Second queue in the pipeline (submit → moderate → moderated → ETL). |
| `services/etl/server.js` | `runConsumer` callback | Consume moderated, write to DB, conditional type_update publish, prefetch(1), nack requeue on error. |
| `services/etl/db/index.js` | DB adapter choice | One-line switch between MySQL and Mongo via env; same interface. |
| `services/joke/server.js` | `tryDbInit` + `dbReady` | Resilience: server listens immediately, 503 until DB is ready, retry loop so Kong never gets connection refused. |
| `services/moderate/typesCache.js` | `addType`, `bootstrapFromJoke` | Event-driven file cache update and startup sync from joke service. |
| `services/moderate/server.js` | OIDC `auth()` block | Protecting moderator with external IdP and same-origin callback (OIDC_BASE_URL). |

---

## 19. Exact Container Names Running on Azure

| Service | Container name |
|---------|----------------|
| Kong | kong-kong-1 |
| Nginx (TLS in front of Kong) | kong-nginx-1 |
| RabbitMQ | rabbitmq-rabbitmq-1 |
| Submit | submit-submit-1 |
| Moderate | moderate-moderate-1 |
| Joke API | joke-joke-1 |
| ETL | joke-etl-1 |
| MySQL | joke-mysql-1 |
| MongoDB | joke-mongo-1 |

---

## 20. Useful Logs and Debug Commands (Azure)

**Get Kong / Nginx status and Kong health:**
```bash
az vm run-command invoke -g jokes-rg -n jokes-kong-vm --command-id RunShellScript --scripts 'docker ps -a; curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/app/joke'
```

**Joke service logs (DB ready / errors):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'docker logs joke-joke-1 --tail 80'
```

**ETL logs (queue consumption, type_update):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'docker logs joke-etl-1 --tail 50'
```

**Moderate service logs:**
```bash
az vm run-command invoke -g jokes-rg -n jokes-moderate-vm --command-id RunShellScript --scripts 'docker logs moderate-moderate-1 --tail 50'
```

**List containers on Joke VM (all four):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
```

**Restart full Joke stack (after config change):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'cd /home/azureuser/app/deploy/joke && RABBITMQ_IP=10.0.1.5 docker compose down && RABBITMQ_IP=10.0.1.5 docker compose up -d'
```

**Restart GitHub Actions runner (on Submit VM):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-submit-vm --command-id RunShellScript --scripts 'cd /home/azureuser/actions-runner && sudo ./svc.sh status; sudo ./svc.sh start'
```

**Check certificate on Kong VM (TLS):**
```bash
az vm run-command invoke -g jokes-rg -n jokes-kong-vm --command-id RunShellScript --scripts 'openssl x509 -in /home/azureuser/kong/certs/cert.pem -noout -dates -subject'
```
