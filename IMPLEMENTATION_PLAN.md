# Option 4 Implementation Plan — First Class (Highest Mark Band)

This document is your roadmap to implement the distributed joke service to **Option 4** standard, aiming for the **Exceptional 1st** band. It follows the university diagram and assessment brief, in industry-standard order.

---

## 1. Target Grade Bands (Option 4)

| Band | Requirement |
|------|-------------|
| **Low 1st** | Moderator microservice + types cache + event handling (ECST) |
| **Mid 1st** | Second database (MySQL or MongoDB) configurable by env var |
| **High 1st** | Continuous Deployment pipeline (Terraform or other, fully automated) |
| **Very High 1st** | Moderator authentication via OpenID Connect (app or Kong plugin) |
| **Exceptional 1st** | All above + professional UIs, high-quality report, test strategy, full NFR/FR demo |

We will implement with **Exceptional 1st** in mind from the start.

---

## 2. Architecture Summary (from Diagram + Brief)

- **Kong** (API Gateway): single entry (80/443), routes to joke, moderate, submit; rate limiting on joke; TLS.
- **Joke VM**: `joke` app, `etl` app, **one** of MySQL or MongoDB (env switch), Docker network between them.
- **Moderate VM**: `moderate` app, types **file cache** (Docker volume).
- **Submit VM**: `submit` app, types **file cache** (Docker volume).
- **RabbitMQ VM**: broker (5672) + management (15672).
- **Networks**: Docker private (green) inside each VM; Azure private (blue) between VMs. No public IPs for backends.

**Event flow (ECST):**

1. Submit: user posts joke → `submit` publishes to **submit** queue.
2. Moderate: consumes **submit** → shows in UI → moderator edits/submits or skips → publishes to **moderated** queue.
3. ETL: consumes **moderated** → writes joke (+ type if new) to DB → on new type, publishes **type_update** event.
4. Moderate & Submit: subscribe to **type_update** (e.g. queues `mod_type_update`, `sub_type_update`) → update types file cache. `/types` reads from file only.

---

## 3. Phased Implementation

### Phase 1 — Option 1 base (local Docker)

**Goal:** Joke + Submit + one database, all in one Docker Compose, Docker DNS.

- [ ] **1.1** Joke service (Node/Express)
  - GET `/joke/:type?count`, GET `/types`.
  - Static UI: request joke by type, show setup then punchline after 3s.
  - Types from DB (API call when dropdown opens).
- [ ] **1.2** Submit service (Node/Express)
  - POST `/submit`, GET `/types`, GET `/docs` (OpenAPI).
  - Static UI: setup, punchline, type dropdown or new type.
- [ ] **1.3** Single database: MySQL **or** MongoDB (your choice for Phase 1).
  - MySQL: tables `jokes`, `types`, no duplicate types.
  - MongoDB: collections with equivalent schema.
- [ ] **1.4** One `docker-compose.yml`: joke, submit, DB; persistent volume for DB.
- [ ] **1.5** Resilience: stop one app, show the other still works.

**Exit:** Full Option 1 (high 3rd) working locally.

---

### Phase 2 — Option 2 (message-based, still local)

**Goal:** ETL + RabbitMQ; submit writes to queue; ETL consumes and writes to DB. Types: submit gets types via HTTP from joke and caches in file (Docker volume).

- [ ] **2.1** RabbitMQ container (persistent queue).
- [ ] **2.2** Submit: publish new joke (+ type) to **submit** queue; GET `/types` from joke service, cache in file (volume); on failure use cache.
- [ ] **2.3** ETL service: consume **submit** queue, transform, write to DB (no duplicate types); ack message.
- [ ] **2.4** Same Compose or split: joke+DB+ETL on one network, submit+RabbitMQ on same Compose with shared RabbitMQ.
- [ ] **2.5** Demonstrate: joke down → submit still works; types from cache; messages in RabbitMQ UI.

**Exit:** Option 2 (high 2:2) working locally.

---

### Phase 3 — Option 3 (API Gateway, HTTPS, Terraform)

**Goal:** Kong as single entry; rate limiting; TLS; Kong VM with Terraform.

- [ ] **3.1** Kong container: routes `/joke/:type`, `/types`, `/submit`, `/docs` (and later `/moderate`, `/moderated`) to correct services.
- [ ] **3.2** Rate limiting on joke API (low value for demo).
- [ ] **3.3** TLS: e.g. mkcert or Let’s Encrypt; certificate on Kong VM, not baked into image.
- [ ] **3.4** Terraform: create Kong VM (and optionally other VMs) in same VNet.
- [ ] **3.5** Client uses single origin (e.g. https://kong-ip/) for all routes.

**Exit:** Option 3 (high 2:1) with Kong + Terraform.

---

### Phase 4 — Option 4 core (ECST + Moderate)

**Goal:** Event-based flow; moderate microservice; type_update events; types file caches.

- [ ] **4.1** **Queues / exchanges (RabbitMQ):**
  - **submit**: submit → moderate (consumer).
  - **moderated**: moderate → ETL (consumer).
  - **type_update** (exchange): ETL publishes; moderate and submit each have dedicated queue (e.g. `mod_type_update`, `sub_type_update`).
- [ ] **4.2** **Moderate service:**
  - GET `/moderate`: get one message from **submit** queue (if any); return to UI; if none, UI shows “no joke” and polls (e.g. every 1s).
  - POST `/moderated`: accept moderated joke/type, publish to **moderated** queue.
  - GET `/types`: return types from **file cache** (Docker volume).
  - On startup / background: subscribe to **type_update** (e.g. `mod_type_update`), update types file.
  - UI: display setup, punchline, type (editable); dropdown of existing types; submit or “next” (reject/skip).
- [ ] **4.3** **Submit:** no longer calls joke for types. Subscribe to **type_update** (`sub_type_update`), update types file. GET `/types` reads from file.
- [ ] **4.4** **ETL:** consume **moderated**; write to DB; if type is new, write type then publish **type_update** event.
- [ ] **4.5** Kong: add routes for `/moderate`, `/moderated`, `/types` (to moderate where needed).
- [ ] **4.6** Resilience: moderate works when joke/submit down; submit works when joke down; show type_update syncing caches.

**Exit:** Low/Mid 1st (moderator + events + types cache).

---

### Phase 5 — Dual database (Mid / High 1st)

**Goal:** Joke + ETL can use **either** MySQL **or** MongoDB, chosen by env (e.g. `DB_TYPE=MYSQL` or `DB_TYPE=MONGO`). One DB running at a time.

- [ ] **5.1** Abstract DB layer in joke service: same API (get jokes by type, get types, etc.) implemented for MySQL and MongoDB.
- [ ] **5.2** Same for ETL: write joke/type to current DB based on env.
- [ ] **5.3** Docker Compose: either start MySQL **or** MongoDB (and other service) according to env; document in README.
- [ ] **5.4** Demonstrate switching DB_TYPE and rebuild/restart; show both paths in video.

**Exit:** Mid 1st (configurable second database).

---

### Phase 6 — Continuous Deployment (High 1st)

**Goal:** Fully automated build, push, deploy for at least the moderator microservice (and ideally all).

- [ ] **6.1** Terraform: all VMs (Kong, Joke+ETL+DB, Moderate, Submit, RabbitMQ) in same VNet; static private IPs where needed.
- [ ] **6.2** Automation: e.g. Terraform local-exec + remote-exec, or GitHub Actions:
  - Build Docker images (e.g. for moderate).
  - Push to a registry (Docker Hub / ACR).
  - On VM: pull image, copy env/config, start container.
- [ ] **6.3** One-command (or one pipeline) from code change to running service.
- [ ] **6.4** Document in report; show in video (can pause during long steps).

**Exit:** High 1st (CD pipeline).

---

### Phase 7 — OIDC (Very High 1st)

**Goal:** Moderator authentication (and optionally authorization for POST `/moderated`).

- [ ] **7.1** Choose OIDC provider (e.g. Keycloak, Auth0, Okta, or free tier).
- [ ] **7.2** Option A: Kong plugin (e.g. openid-connect) — authenticate at gateway for routes to moderate.
- [ ] **7.3** Option B: Application-level — moderate service checks token / session from IdP.
- [ ] **7.4** Only authenticated (and if required, authorized) users can access moderator UI and POST `/moderated`.
- [ ] **7.5** Document and demonstrate in video.

**Exit:** Very High 1st (OIDC).

---

### Phase 8 — Exceptional 1st (polish)

**Goal:** Professional UIs, test strategy, report, video.

- [ ] **8.1** UI polish: clear, consistent HTML/CSS/JS; no need for React — keep it maintainable.
- [ ] **8.2** Test strategy: what you test (resilience, API contracts, event flow, auth), how (manual, Postman, RabbitMQ checks), and document in report.
- [ ] **8.3** Report: self-assessment with proposed grade; critique of patterns/technologies (alternatives to microservices, API gateway, RabbitMQ, Express, static serving); code discussion (pooling, queues, events, auth, CD).
- [ ] **8.4** Video (≤15 min): all FR/NFR demos; resilience; both DBs; events; CD; OIDC; concise and well-articulated.

**Exit:** Exceptional 1st ready for submission.

---

## 4. Repository Layout (industry-style)

```
distributed-jokes/
├── IMPLEMENTATION_PLAN.md          # this file
├── README.md                       # how to run, env vars, options
├── docker-compose.yml              # local dev (all services)
├── .env.example
│
├── services/
│   ├── joke/                       # Node/Express, port 3000
│   ├── submit/                     # Node/Express, port 3200
│   ├── etl/                         # Node/Express, port 3001
│   └── moderate/                   # Node/Express, port 3100
│
├── gateway/                        # Kong config (declarative yaml)
├── terraform/                      # VMs, VNet, optional CD
└── docs/                           # OpenAPI, diagrams, notes
```

Each service: `package.json`, `Dockerfile`, small README, `.env.example` snippet.

---

## 5. Key Technical Choices

- **Runtime:** Node.js + Express (per brief).
- **Databases:** MySQL + MongoDB (one active at a time for joke/ETL); schema equivalent (jokes + types).
- **Broker:** RabbitMQ — queues `submit`, `moderated`; fanout (or topic) for `type_update` with distinct queues per consumer.
- **API docs:** OpenAPI (Swagger) for submit (GET `/docs`); same style for others if helpful.
- **Containers:** One process per container; Docker Compose for local; same images for Azure.
- **Secrets:** Env vars (`.env`); never commit secrets.

---

## 6. Submission Checklist (brief)

- [ ] **Report** (Word, ≤2000 words): front sheet, self-assessment/grade, critique of patterns/tech, code discussion, no AI-written text.
- [ ] **Video** (.mp4, ≤15 min for Option 4): all requirements demonstrated; resilience; events; CD; OIDC; both DBs.
- [ ] **Zip:** source, `.env` examples, `docker-compose`, Dockerfiles, Terraform (no `.terraform`), package.json, DB exports (MySQL SQL, Mongo JSON); no `node_modules`.

---

## 7. Next Step

Start with **Phase 1**: implement joke and submit services plus one database in a single Docker Compose, with Docker DNS and persistent volume. Once that is done, we’ll add RabbitMQ and ETL (Phase 2), then Kong and Terraform (Phase 3), and so on.

If you want, next we can generate the exact folder structure and stub code for `joke` and `submit` (Phase 1.1–1.2) so you can run and test them immediately.
