# Phase 4 Testing Guide

Run these checks **with the stack up** (`docker compose up -d`) to verify Phase 4 before moving to Phase 5.

---

## 1. Single origin (Kong)

All requests go through **http://localhost** (port 80).

- **Joke UI:** http://localhost/app/joke  
- **Submit UI:** http://localhost/app/submit  
- **Moderate UI:** http://localhost/app/moderate  

Confirm each page loads and assets (JS/CSS) work (no 404s in browser DevTools).

---

## 2. Full flow: Submit → Moderate → ETL → DB

**2.1 Submit a joke (API)**

```bash
curl -s -X POST http://localhost/submit \
  -H "Content-Type: application/json" \
  -d '{"setup":"Phase4 test setup","punchline":"Phase4 punchline","type":"Phase4Test"}'
```

Expect: `{"ok":true}` (201).

**2.2 Moderate: fetch the joke**

```bash
curl -s http://localhost/moderate
```

Expect: JSON with `setup`, `punchline`, `type` (the joke you submitted).

**2.3 Moderate: approve it**

```bash
curl -s -X POST http://localhost/moderated \
  -H "Content-Type: application/json" \
  -d '{"setup":"Phase4 test setup","punchline":"Phase4 punchline","type":"Phase4Test"}'
```

Expect: `{"ok":true}` (201).

**2.4 Wait ~2 seconds, then check types and joke API**

```bash
curl -s http://localhost/submit/types
curl -s "http://localhost/joke/Phase4Test?limit=5"
```

- `/submit/types` should include `"Phase4Test"` (type_update synced to submit’s file cache).
- `/joke/Phase4Test` should return the joke (ETL wrote to DB).

**2.5 Joke UI**

- Open http://localhost/app/joke, choose type “Phase4Test”, click “Get a joke”. You should see the joke.

---

## 3. Moderator UI (manual)

1. Open http://localhost/app/moderate.
2. Click “Get next” (or wait for poll). The joke you submitted should appear.
3. Optionally edit type/setup/punchline, then click “Approve” (or “Skip” to discard).
4. After approve, “Get next” should show “No joke” until you submit another.

---

## 4. Submit UI + types from cache

1. Open http://localhost/app/submit.
2. Dropdown “Type” should list types (e.g. “Any”, “Phase4Test”) from file cache.
3. Submit a new joke with a **new type** (e.g. “ManualTest”). After a moderator approves it, refresh the submit page — the new type should appear in the dropdown (type_update → submit cache).

---

## 5. Resilience (optional)

**5.1 Submit when joke is down**

- Stop joke: `docker compose stop joke`
- Submit a joke via UI or curl. Should succeed (submit publishes to queue only).
- Get types at http://localhost/submit/types — should still return cached types (or empty if none yet).
- Start joke again: `docker compose start joke`

**5.2 Moderate when joke is down**

- With joke stopped, open http://localhost/app/moderate. “Get next” can still show jokes from the **submit** queue. Approve one; ETL will consume from **moderated** and write to DB. Types cache on moderate is updated via type_update (ETL publishes).

**5.3 Switching database (Phase 5 – MySQL ↔ MongoDB)**

- When you switch DB, **restart the full stack** so joke and ETL use the new DB and submit/moderate re-sync their types cache from joke:
  - **To MongoDB:** `DB_TYPE=mongo MONGO_URI=mongodb://172.28.0.12:27017/jokedb docker compose up -d`
  - **To MySQL:** `docker compose up -d`
- Then check: /app/joke and /app/submit show the same types (from current DB); submit → moderate → approve → joke shows the new joke.

---

## 6. RabbitMQ (optional)

- Open http://localhost:15672 (guest/guest).
- Check queues: `submit`, `moderated`, `mod_type_update`, `sub_type_update`.
- Check exchange: `type_update` (fanout).
- After approving a joke with a new type, you should see messages flow: submit → (consumed by moderate) → moderated → (consumed by ETL) → type_update (fanout to both queues).

---

## Quick one-liner flow test

```bash
# Submit
curl -s -X POST http://localhost/submit -H "Content-Type: application/json" \
  -d '{"setup":"A","punchline":"B","type":"QuickTest"}' && echo " submitted"

# Get from moderate and approve
curl -s http://localhost/moderate | tee /tmp/j.json
curl -s -X POST http://localhost/moderated -H "Content-Type: application/json" -d @/tmp/j.json && echo " approved"

# After ~2s: types and joke
sleep 2 && curl -s http://localhost/submit/types && echo ""
curl -s "http://localhost/joke/QuickTest?limit=1"
```

If all steps pass, Phase 4 is good to go before Phase 5 (dual database).
