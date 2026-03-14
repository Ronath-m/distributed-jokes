# Assignment context and phases

This doc restates **what we’re building** and **the phases we planned** so we stay aligned with the assignment and the plan.

---

## What the assignment asks for (Option 4)

- **Distributed joke system**: submit jokes → moderate (human approval) → ETL into DB → serve by type.
- **Tech**: API gateway (Kong), message broker (RabbitMQ), microservices (joke, submit, moderate, ETL), at least one DB (MySQL and/or MongoDB), optional Azure + Terraform.
- **Moderator authentication (Phase 7)**: the **moderator** (approve/reject jokes) must support **login** — i.e. **OIDC** (OpenID Connect) so only authenticated users can moderate. This is a stated requirement for the assignment.

So: **OIDC is not optional for the assignment.** For submission/demo we need the moderator behind login (OIDC). The code supports “no OIDC” so you can run the stack locally without Keycloak; for the **actual deliverable**, OIDC should be **enabled** and working.

---

## Phases we planned (from the start)

| Phase | Goal |
|-------|------|
| **1–2** | Basic joke service + DB, types, simple flow. |
| **3** | Kong as single entry point (single origin). |
| **4** | RabbitMQ: submit queue → moderate → moderated queue → ETL → DB; type_update events; UIs for joke, submit, moderate. |
| **5** | Dual DB: switch between MySQL and MongoDB (same app, one active at a time). |
| **6** | Azure: Terraform (VNet, VMs), deploy Kong, joke, submit, moderate, RabbitMQ; CD (e.g. GitHub Actions). |
| **7** | **OIDC for moderator**: Keycloak (or other IdP); moderator requires login; logout; works behind Kong or direct URL. |
| **8** | Polish: UI consistency, test strategy doc, report, video (Exceptional 1st). |

**Phase 7** = add **moderator authentication (OIDC)**. That’s what we implemented: `express-openid-connect` in the moderate service, Keycloak in Docker, env vars for issuer/base URL/client. When OIDC env vars are set, the moderator is protected; when they’re not set, the app still runs (useful for local dev without Keycloak).

---

## What we want to achieve (summary)

1. **Full flow working**: Submit → queue → Moderate (UI) → approved → ETL → DB → Joke API/types.
2. **Single origin**: All traffic through Kong at `http://localhost` (or your Kong URL).
3. **Phase 7 (assignment requirement)**: Moderator **requires login** via OIDC for the **submission/demo**. So for marking:
   - Run with Keycloak and OIDC env vars set.
   - Open moderator (e.g. `http://localhost:4100` or via Kong); get redirected to Keycloak; log in; then moderate. Logout works.
4. **Phase 8**: Consistent UI, test strategy documented, report, video.

---

## How the repo supports this

- **Moderate service** (`services/moderate`): Has OIDC wired in. If `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_BASE_URL`, `OIDC_BASE_URL`, `OIDC_CLIENT_ID` (and optionally `OIDC_ISSUER_INTERNAL_URL`, `OIDC_SECRET`) are set in `.env`, the moderator is behind login. If not set, moderator is open (for local dev).
- **Root `docker-compose.yml`**: Starts Kong, MySQL, Mongo, RabbitMQ, joke, ETL, submit, moderate. Keycloak is in profile `oidc` so it doesn’t start by default; for Phase 7 demo run:  
  `docker compose --profile oidc up -d`  
  and set the OIDC vars in `.env` (and configure Keycloak realm/client/redirect URIs as in your OIDC setup doc).
- **Docs**: Use `docs/OIDC_SETUP.md` (or equivalent) for how to configure Keycloak and the OIDC_* env vars. For “what we’re doing” and phases, use this file.

---

## What you should do for the assignment

1. **Local run (no auth)**: `docker compose up -d` → use http://localhost/app/joke, /app/submit, /app/moderate.
2. **Phase 7 demo / submission**:  
   - Start Keycloak: `docker compose --profile oidc up -d`  
   - Configure Keycloak (realm, client, redirect URI for moderator, e.g. `http://localhost:4100/callback`).  
   - Add a `.env` in the project root with `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_BASE_URL` (e.g. `http://localhost:4100`), `OIDC_ISSUER_BASE_URL` (e.g. `http://localhost:8080/realms/jokes`), and `OIDC_ISSUER_INTERNAL_URL` (e.g. `http://keycloak:8080/realms/jokes`) for the container.  
   - Restart moderate: `docker compose up -d moderate`  
   - Open the moderator at http://localhost:4100 → redirect to login → moderate → logout.  
3. **Phase 8**: Polish UI, document test strategy, write report, record video.

This way we meet the **assignment requirement** (OIDC for moderator in Phase 7) while keeping the option to run without OIDC for day-to-day dev.
