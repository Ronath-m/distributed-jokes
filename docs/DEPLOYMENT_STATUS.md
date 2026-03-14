# Deployment status: what’s done vs missing (Azure / VMs)

This doc reflects a full pass over the codebase and the assignment brief. **Focus is on the deployed (VM) path;** local Docker Compose is not required for submission.

---

## 1. What’s in place (done)

### Terraform (Phase 6)
- **5 VMs** in 3 regions: Kong (10.0.1.4), RabbitMQ (10.0.1.5), Joke (10.1.1.4), Moderate (10.2.1.4), Submit (10.2.1.5).
- **VNets** and peering so all VMs can reach each other by private IP.
- **Kong** has a public IP; **Submit** has a public IP (for SSH / runner).
- **CustomScript extensions**: install Docker, then run Compose (Kong/RabbitMQ from embedded config; Joke/Moderate/Submit from cloned repo when `repo_url` is set).
- **Kong on Azure** uses `gateway/kong-azure.example.yml` with correct private IPs (10.1.1.4, 10.2.1.4, 10.2.1.5).
- **Outputs**: `kong_public_ip`, `submit_public_ip`, `private_ips`, etc.

### Deploy (per-VM Compose)
- **deploy/kong/** – Kong with mounted `kong.yml` (Terraform writes the Azure kong.yml).
- **deploy/rabbitmq/** – RabbitMQ only.
- **deploy/joke/** – MySQL + joke + ETL; `RABBITMQ_IP` from env.
- **deploy/moderate/** – moderate service; `JOKE_IP`, `RABBITMQ_IP` from env.
- **deploy/submit/** – submit service; same env pattern.

### GitHub Actions CD
- **Workflow** `.github/workflows/cd.yml`: on push to `main`, runs on self-hosted runner with label `azure`.
- **Builds and pushes** moderate image to GHCR (optional use; see gap below).
- **Azure login** via Managed Identity (no app registration).
- **Redeploys** all three app VMs via `az vm run-command`: git pull, then `docker compose up -d --build` in deploy/joke, deploy/moderate, deploy/submit with `JOKE_IP=10.1.1.4` and `RABBITMQ_IP=10.0.1.5`.
- **Self-hosted runner** doc: `docs/SELF_HOSTED_RUNNER_SETUP.md` (submit VM, Managed Identity, label `azure`).

### Assignment checklist (already satisfied in code)
- Submit → submit queue; moderate consumes; POST /moderated → moderated queue; ETL consumes and writes to DB; type_update flow; Kong single origin; rate limit on joke; moderate UI (editable, poll, types from cache); Docker; Express; static UI; RabbitMQ on its own VM; Terraform for VMs.

---

## 2. Gaps (missing for deployed / brief)

### 2.1 OIDC on Azure (critical – brief requirement)
- **Brief**: Moderator must support login (OIDC); only authenticated users can moderate.
- **Current**: `deploy/moderate/docker-compose.yml` has **no OIDC env vars** (`OIDC_ISSUER_BASE_URL`, `OIDC_BASE_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_SECRET`). So on the VMs the moderator runs **without login**.
- **Also**: There is **no Keycloak (or other IdP) on Azure**. Locally you use Keycloak in Docker; on Azure you need either:
  - A Keycloak (or other IdP) instance reachable from the internet and from the moderate VM (e.g. Keycloak on a 6th VM or a hosted IdP), and
  - OIDC env on the moderate VM pointing at that issuer and at the **public** moderator URL (e.g. `http://<kong_public_ip>/app/moderate` or a dedicated moderate URL if you expose it).

**What to do**: Add OIDC to the deployed moderator (env in deploy/moderate and/or Terraform/CD) and either deploy Keycloak (e.g. extra VM + Compose) or use a hosted IdP; document redirect URIs and base URL for `http://<kong_public_ip>/...`.

### 2.2 Both databases (MySQL and MongoDB) on deploy
- **Brief**: Joke service configurable for **MySQL or MongoDB** by env (one at a time).
- **Current**: `deploy/joke/docker-compose.yml` is **MySQL only** (no MongoDB service, no `DB_TYPE=mongo` / `MONGO_URI` option).
- **What to do**: Add optional MongoDB to deploy/joke (or a second compose profile) and pass `DB_TYPE` / `MONGO_URI` so you can demonstrate “both DBs” on Azure (e.g. in report/video).

### 2.3 TLS on gateway (Mid 2:1+)
- **Brief**: SSL/TLS on the gateway.
- **Current**: `gateway/README.md` describes TLS (mkcert locally; Let’s Encrypt or self-signed on Azure) but Kong on Azure is deployed with **HTTP only** (port 80). No cert mount or `KONG_PROXY_LISTEN` 8443 ssl in `deploy/kong/docker-compose.yml`.
- **What to do**: If you’re aiming for Mid 2:1+, add TLS on the Kong VM (cert on VM, Kong config for 8443 ssl) and document it.

### 2.4 Test strategy doc (Exceptional 1st)
- **Brief**: “Test strategy” (e.g. `docs/TEST_STRATEGY.md`) – what you test, how.
- **Current**: No `TEST_STRATEGY.md` (or equivalent) in the repo.
- **What to do**: Add a short doc describing test approach (e.g. manual flows, what you run on Azure vs local, resilience checks, OIDC, both DBs).

### 2.5 Terraform outputs bug
- **Current**: `terraform/outputs.tf` defines `joke_public_ip` referencing `azurerm_public_ip.joke_pip`, but **no resource `joke_pip`** exists in `main.tf` (only `kong_pip` and `submit_pip`).
- **What to do**: Either remove the `joke_public_ip` output or add a `joke_pip` public IP resource and attach it to the joke VM’s NIC if you need that output.

### 2.6 Typo in terraform.tfvars
- **Current**: Line has `orkregion_joke = "eastasia"` (likely meant `region_joke` or duplicate).
- **What to do**: Fix to the intended variable name and value.

### 2.7 CD: built image vs build-from-repo
- **Current**: CD builds and pushes the moderate image to GHCR but the deploy step on the VMs does `docker compose up -d --build` from the repo (builds from `../../services/moderate`). So the **pushed image is not used** on the VMs.
- **What to do**: Either (a) switch deploy/moderate to `image: ghcr.io/...` and pull that image (so CD “build once, deploy everywhere”) or (b) leave as-is and treat the push as optional (e.g. for a registry-based flow later). Not a brief requirement but worth being consistent.

---

## 3. Where the brief was under-emphasised (and I missed it)

- **“Local” vs “deployed”**: The brief and verification checklist mention both “local” (Docker Compose, localhost) and “your Kong URL” / Terraform / VMs. The docs (ASSIGNMENT_AND_PHASES, OIDC_SETUP, verification “Quick verification commands”) are written mainly for **local** run. So it was easy to focus on localhost and not spell out that **for submission/demo you should demonstrate and test on the deployed VMs** (Kong public IP, OIDC on Azure, both DBs on Azure if required).
- **OIDC “works behind Kong or direct URL”**: The requirement applies to the **deployed** moderator as well. We only wired and tested OIDC locally; the deploy path never got OIDC env or Keycloak.
- **Continuous deployment**: The brief asks for “fully automated” CD for the moderator (or equivalent). You have CD that redeploys joke, moderate, and submit on push. That satisfies the idea; the gap is that the **moderator on Azure doesn’t have OIDC** so “moderator behind login” isn’t demonstrated on the deployed system.

---

## 4. Suggested order of work (no more local focus)

1. **OIDC on Azure**  
   - Add OIDC env to `deploy/moderate/docker-compose.yml` (or inject via Terraform/CD).  
   - Deploy Keycloak (e.g. 6th VM + Compose) or use a hosted IdP.  
   - Set `OIDC_BASE_URL` to `http://<kong_public_ip>/app/moderate` (and issuer/redirect URIs accordingly).  
   - Test: open `http://<kong_public_ip>/app/moderate` → redirect to login → moderate → logout.

2. **Both DBs on deploy**  
   - Add MongoDB option to `deploy/joke/` and document how to switch DB_TYPE for the video/report.

3. **Terraform**  
   - Fix `outputs.tf` (remove or add `joke_pip`).  
   - Fix `terraform.tfvars` typo.

4. **Docs**  
   - Add `docs/TEST_STRATEGY.md`.  
   - Optionally add a short “Deployed verification” section (e.g. in ASSIGNMENT_VERIFICATION.md) that uses **Kong public IP** and the VM setup instead of localhost.

5. **TLS (if targeting Mid 2:1+)**  
   - Configure Kong on the VM for HTTPS and document.

---

## 5. Quick reference: access after deploy

| What              | URL / How |
|-------------------|-----------|
| **Gateway (users)** | `http://<kong_public_ip>` from `terraform output kong_public_ip` |
| **Joke UI**       | `http://<kong_public_ip>/app/joke` |
| **Submit UI**     | `http://<kong_public_ip>/app/submit` |
| **Moderate UI**   | `http://<kong_public_ip>/app/moderate` (should require OIDC once fixed) |
| **SSH submit VM** | `ssh azureuser@<submit_public_ip>` (runner + Azure CLI) |
| **Private IPs**   | `terraform output private_ips` (for Kong config and app env only; not for browser). |

All “Quick verification commands” in ASSIGNMENT_VERIFICATION.md that use `localhost` should be re-run on the deployed stack using `http://<kong_public_ip>` (and, for OIDC, after OIDC is enabled on Azure).
