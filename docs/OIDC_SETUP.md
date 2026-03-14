# Phase 7: OIDC setup for moderator (Keycloak)

Use this to meet the assignment requirement: **moderator behind login**.

## 0. If you get "Connection refused" or "This site can't be reached"

The stack is not running. From the **project root** (where `docker-compose.yml` and `.env` are), start everything:

```bash
docker compose --profile oidc up -d
```

- Wait ~30s for Keycloak and healthchecks.
- **Moderator (with login):** http://localhost:4100  
- **Keycloak admin:** http://localhost:8080  
- **Kong (joke/submit/moderate UIs):** http://localhost  

Check that containers are up: `docker compose ps`. If `moderate` is exited, run `docker compose logs moderate` to see errors.

## 1. Start the stack with Keycloak

From the project root:

```bash
docker compose --profile oidc up -d
```

Wait ~30s. Keycloak will be at **http://localhost:8080**.

## 2. Configure Keycloak

1. Open http://localhost:8080 → **Administration Console**.
2. Log in: **admin** / **admin** (or whatever you set in docker-compose for `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`).
3. Create a **realm**: e.g. **jokes** (Realm name = `jokes`, leave defaults, Create).
4. In realm **jokes**, go to **Clients** → **Create client**:
   - Client ID: **moderate-app**
   - Client type: **OpenID Connect**
   - Next → set **Valid redirect URIs**: `http://localhost:4100/callback`, `http://localhost:4100/*`, `http://host.docker.internal:4100/callback`, `http://host.docker.internal:4100/*`
   - Next → **Client authentication** ON (confidential client)
   - Next → Save.
5. Open the **moderate-app** client → **Credentials** tab → copy the **Secret** (this is `OIDC_CLIENT_SECRET`).

## 3. Set environment variables

In the project root, create **.env** (or copy from `.env.example`) and set:

```env
OIDC_ISSUER_BASE_URL=http://localhost:8080/realms/jokes
OIDC_ISSUER_INTERNAL_URL=http://keycloak:8080/realms/jokes
OIDC_BASE_URL=http://localhost:4100
OIDC_CLIENT_ID=moderate-app
OIDC_CLIENT_SECRET=<paste the secret from Keycloak>
OIDC_SECRET=any-long-random-string-for-session-encryption
```

`OIDC_ISSUER_BASE_URL` is what the **browser** uses (localhost). `OIDC_ISSUER_INTERNAL_URL` is what the **moderate container** uses to reach Keycloak (keycloak hostname).

## 4. Restart the moderate service

So it picks up the new env:

```bash
docker compose up -d moderate
```

## 5. Test (Phase 7 demo)

1. Open **http://localhost:4100** (moderator direct URL).
2. You should be redirected to Keycloak to log in.
3. After login, you see the moderator UI; get next joke, approve/skip.
4. Use the **Log out** link to confirm logout.

For submission/demo: show that unauthenticated users are redirected to login, and that after login they can moderate and then log out.

## Without OIDC (local dev only)

- Do **not** set `OIDC_CLIENT_SECRET` (and leave other OIDC_* empty or unset).
- Run `docker compose up -d` (no `--profile oidc`).
- Moderator at http://localhost/app/moderate or http://localhost:4100 is open (no login).
