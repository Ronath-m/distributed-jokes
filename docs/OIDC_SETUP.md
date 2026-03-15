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

---

## Azure (deployed) OIDC – moderator behind login via Kong

When the stack is on Azure (Terraform VMs), Keycloak runs on the **Kong VM** (port 8080). The CD workflow passes the Kong public IP and your secrets to the moderate VM so the moderator requires login at `http://<kong-public-ip>/app/moderate`.

### 1. Open port 8080 and start Keycloak on the Kong VM

- **If you haven’t applied Terraform since Keycloak was added:** run `terraform apply` so the new NSG rule (port 8080) and updated Kong compose (with Keycloak) are applied. The Kong VM extension may not re-run; if Keycloak doesn’t start, do step 2 manually.
- **If Terraform was already applied before Keycloak was added:** SSH to the Kong VM (e.g. via Bastion or a jump host). Get the Kong VM’s public IP from the Azure portal or `terraform output kong_public_ip`. Then either:
  - Copy the repo’s `deploy/kong/docker-compose.yml` (which now includes Keycloak) and `gateway/kong-azure.example.yml` into `/home/azureuser/kong/` on the VM, then run:
    ```bash
    cd /home/azureuser/kong && docker compose up -d
    ```
  - Or add the Keycloak service from `deploy/kong/docker-compose.yml` to the existing compose on the VM and run `docker compose up -d`.

Wait ~30s. Keycloak will be at **http://\<kong-public-ip\>:8080**.

### 2. Configure Keycloak (Azure)

1. Open **http://\<kong-public-ip\>:8080** (e.g. http://4.193.203.108:8080) → **Administration Console**.
2. Log in: **admin** / **admin**.
3. Create realm **jokes** (Realm name = `jokes`, Create).
4. In realm **jokes** → **Clients** → **Create client**:
   - Client ID: **moderate-app**
   - Client type: **OpenID Connect**
   - **Valid redirect URIs:**  
     `http://<kong-public-ip>/app/moderate/callback`  
     `http://<kong-public-ip>/app/moderate/*`  
     (e.g. `http://4.193.203.108/app/moderate/callback`, `http://4.193.203.108/app/moderate/*`)
   - **Client authentication** ON → Save.
5. Open **moderate-app** → **Credentials** tab → copy the **Secret**.

### 3. GitHub Secrets (for CD)

In the repo: **Settings → Secrets and variables → Actions** → New repository secret:

| Secret               | Value |
|----------------------|--------|
| **OIDC_CLIENT_SECRET** | The Keycloak client secret from step 2. |
| **OIDC_SECRET**        | Any long random string (e.g. `openssl rand -hex 32`) for session encryption. |

The CD workflow uses these when redeploying the moderate VM so the moderator runs with OIDC enabled.

### 4. Redeploy moderate (with OIDC)

- **Option A:** Push a commit to `main`. The CD workflow will redeploy the moderate VM with `OIDC_ISSUER_BASE_URL`, `OIDC_BASE_URL` (from Kong public IP), and the secrets.
- **Option B:** On the moderate VM, run deploy manually with env set:
  ```bash
  export JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5
  export OIDC_ISSUER_BASE_URL=http://<kong-public-ip>:8080/realms/jokes
  export OIDC_BASE_URL=http://<kong-public-ip>/app/moderate
  export OIDC_CLIENT_ID=moderate-app
  export OIDC_CLIENT_SECRET=<your-keycloak-client-secret>
  export OIDC_SECRET=<your-session-secret>
  cd /home/azureuser/app/deploy/moderate && docker compose up -d --build
  ```

### 5. Test (Azure)

1. Open **http://\<kong-public-ip\>/app/moderate** (e.g. http://4.193.203.108/app/moderate).
2. You should be redirected to Keycloak at `http://\<kong-public-ip\>:8080` to log in.
3. After login, you should land on the moderator UI; moderate and log out.

If you don’t set **OIDC_CLIENT_SECRET** (and **OIDC_SECRET**) in GitHub Secrets, the moderate app on Azure will still deploy but will run **without** login (open moderator).
