# CO3404 Option 4 – Verification checklist (from assessment brief)

Use this to confirm every requirement is met before the report and video. Tick off as you verify.

---

## Submission artefacts (all three required)

| Item | Brief requirement | Done | Notes |
|------|-------------------|------|--------|
| Report | Single Word doc, front sheet + auth statement first, max **2000 words** | | |
| Video | Single **.mp4**, Option 4: **max 15 minutes**; Options 1–3: max 11 min | | Submit to Blackboard, not in zip, not a link |
| Zip | Source + .env, package.json, Dockerfile(s), compose, **db exports**; **NO** node_modules, **NO** .terraform | | Test zip decompresses on Windows |
| MySQL export | Single SQL file including schema | | |
| MongoDB export | Single JSON file (if used) | | |

---

## Option 4 – Functional & non-functional (from brief)

### Architecture (ECST, queues, moderate)

| # | Requirement | Where / how | ✓ |
|---|-------------|-------------|---|
| 1 | Submit puts new joke onto **submit** queue; **moderate** consumes it | submit publishes to `submit`; moderate GET /moderate uses getOneFromSubmit() | |
| 2 | Moderator reviews (editable UI); on approve, moderate sends to **moderated** queue; **ETL** consumes and writes to DB | POST /moderated → publishModerated(); ETL consumes `moderated` queue | |
| 3 | ETL writes type to DB; if new type, publishes **type_update** event; **moderate** and **submit** subscribe and update file cache | ETL publishes to `type_update` fanout; mod_type_update, sub_type_update queues | |
| 4 | Types API reads from file cache only (no sync call to joke service for types on submit/moderate) | GET /submit/types, GET /moderate/types from typesCache | |

### Moderate microservice (brief § “Moderate microservice functional requirements”)

| # | Requirement | Where / how | ✓ |
|---|-------------|-------------|---|
| 1a | UI: display setup, punchline, type from queue; **editable** | moderate public/index.html – textareas + type select/edit | |
| 1b | Submit (approve) or reject (don’t submit, get next) | Approve → POST /moderated; Skip → fetch next | |
| 1c | If no joke: show message, **poll** (e.g. 1 s) for new joke | noJoke card + startPolling() in app.js | |
| 1d | Types dropdown from cache; moderator can pick or enter new type | typeSelect + typeNew; loadTypes() from /moderate/types | |
| 1e | Types list updated via **type_update** event | typeUpdateConsumer.js → addType() → file cache | |
| 2 | Moderate runs on Node **Express** | services/moderate/server.js | |
| 3 | Web/CSS/JS served as **static** from moderate’s node server | express.static('public') | |
| 4 | Moderate in **Docker** container | docker-compose: moderate build + image | |
| 5a | **GET /moderate** – one joke from queue or “none available” | server.js GET /moderate → getOneFromSubmit(); JSON or noJoke | |
| 5b | **POST /moderated** – post moderated joke/type to queue | server.js POST /moderated → publishModerated() | |
| 5c | **GET /types** – types from file cache (volume) | GET /moderate/types → readCache() | |
| 6 | If **joke** or **submit** down, moderator can still submit (business continuity) | Submit uses queue; moderate consumes submit queue; ETL consumes moderated – no direct dependency on joke/submit for flow | |
| 7 | RabbitMQ in Docker; on its own VM (for Azure) | rabbitmq service; deploy/rabbitmq or Terraform VM | |
| 8 | **Second database**: joke service configurable **MySQL OR MongoDB** by env (not both at once) | DB_TYPE=mysql | mongo; joke + ETL use same DB_TYPE | |
| 9 | **Moderator authentication**: OIDC; moderator must authenticate (privileged role); POST /moderated requires auth | express-openid-connect; Keycloak; docs/OIDC_SETUP.md | |
| 10 | **Continuous deployment** for moderator (or equivalent): Terraform or other, **fully automated** | GitHub Actions + Terraform (e.g. deploy moderate VM / image) | |

### Option 3 carry-over (Kong, rate limit, TLS, Terraform)

| # | Requirement | Where / how | ✓ |
|---|-------------|-------------|---|
| Kong | Single origin; forward to joke, submit, moderate | gateway/kong.yml; /app/joke, /app/submit, /app/moderate; /joke, /submit, /moderate, etc. | |
| Rate limit | Joke API rate limited (low value for demo) | kong.yml: rate-limiting 5/min on joke-api | |
| TLS | SSL/TLS on gateway (Mid 2:1+) | gateway/README.md; certificate on VM not in image | |
| Terraform | Kong VM (and optionally rest) created with Terraform | terraform/main.tf; same VNet for VMs | |

### Option 2 carry-over (submit, ETL, types cache, resilience)

| # | Requirement | Where / how | ✓ |
|---|-------------|-------------|---|
| Submit | POST /submit, GET /types, GET /docs; types from cache; publish to queue | submit server + typesCache + queue | |
| ETL | Consume queue, transform, load into DB; no duplicate types (MySQL) | etl/server.js + db; loadJoke, type_update publish | |
| Types cache | File in Docker volume; refreshed by type_update event | TYPES_CACHE_PATH, volumes | |
| Resilience | If one app down, others still work; **demonstrate in video** | Stop joke → submit/moderate still work; doc TESTING_PHASE4 §5 | |

### Exceptional 1st (brief § “Exceptional 1st”)

| # | Requirement | Where / how | ✓ |
|---|-------------|-------------|---|
| 1 | Professional, usable UIs (HTML/CSS/JS fine, no React required) | joke, submit, moderate public/ – nav, cards, forms | |
| 2 | High-quality **report** | Your report – self-assessment, critique, code discussion | |
| 3 | **Test strategy** | docs/TEST_STRATEGY.md (or equivalent) – what you test, how | |
| 4 | Demonstrate **all** FR and NFR in report and **concise, well-articulated video** | Video script covering: flow, events, both DBs, CD, OIDC, resilience | |

---

## Video (Option 4) – brief § “Video specifics for this option”

- **Max 15 minutes.**
- Show **system operation**; code detail only for key/research areas.
- Demonstrate:
  - All FR/NFR (as for Option 3).
  - **Events**: type_update flow (e.g. approve new type → types appear in submit/moderate).
  - **Continuous deployment** of at least one microservice.
  - **Authentication** (OIDC): login to moderator, then moderate; logout.
  - **Both databases**: switch DB_TYPE, show joke/ETL using MySQL then Mongo (or vice versa).
  - **Resilience**: stop one service (e.g. joke), show others still work and resync when it’s back.
- You may pause recording during long steps (VM creation, Docker install, etc.).
- Explain in **report** what you didn’t have time to cover in depth in the video.

---

## Report – brief requirements

- **Front sheet** with statement of originality as first part.
- **Self-assessment**: first paragraph – how well requirements are satisfied, proposed **grade %** with justification (use banding table; no “between” marks).
- **Critique of patterns/technologies** (learning outcomes 1 & 2): alternatives to message-based microservices; alternatives to assessment architecture; Node/Express alternatives; static content vs other UI approaches; RabbitMQ vs other messaging; etc. (See brief “Critically evaluate…” and “Compare potential technologies…”.)
- **Code discussion**: techniques, difficulties, key implementations (e.g. pooling, queues, events, auth, **continuous deployment**, OIDC). More detail here for what you only touched on in the video.
- **Max 2000 words.**
- Single **Word** document; **not** in the zip.

---

## Quick verification commands

1. **Stack**  
   `docker compose up -d` → all 8 up; UIs at http://localhost/app/joke, /app/submit, /app/moderate.

2. **Full flow**  
   Submit joke → Moderate (get next, approve) → wait ~2s → /submit/types and /joke/:type show it. (See docs/TESTING_PHASE4.md.)

3. **Resilience**  
   `docker compose stop joke` → submit + moderate still work; restart joke → resync.

4. **Both DBs**  
   `DB_TYPE=mongo MONGO_URI=mongodb://172.28.0.12:27017/jokedb docker compose up -d joke etl` → use app → switch back to MySQL and repeat.

5. **OIDC**  
   `docker compose --profile oidc up -d`, configure Keycloak + .env (docs/OIDC_SETUP.md), restart moderate → http://localhost:4100 → login → moderate → logout.

6. **Zip for submission**  
   Remove all `node_modules` and `.terraform`; include source, .env (or .env.example + instructions), package.json, Dockerfile(s), docker-compose, **MySQL export (SQL with schema)**, MongoDB export (JSON) if used, Terraform **source only** (no .terraform). Test decompress on Windows.

---

## Option 4 diagram vs this implementation

- **Kong**: single entry; routes to joke, submit, moderate (and /types, /docs as per kong.yml). ✓  
- **joke**: 4000→3000; MySQL or MongoDB; /joke/:type, /types. ✓  
- **submit**: 4200→3200; types cache; publish to submit queue; consume type_update. ✓  
- **moderate**: 4100→3100; types cache; consume submit queue; publish moderated; consume type_update. ✓  
- **etl**: 3001; consume moderated; write to DB; publish type_update. ✓  
- **RabbitMQ**: 5672, 15672 (admin). ✓  
- **MySQL + MongoDB**: both available; one active via DB_TYPE. ✓  

If any row above is not true in your repo, fix before submission and re-run the checks in “Quick verification commands”.
