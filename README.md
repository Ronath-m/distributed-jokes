# Distributed Jokes — Option 4 (First Class)

Distributed joke service: submit jokes, moderate via queue, ETL into DB, serve by type. Built for CO3404 (Option 4) with Kong, RabbitMQ, MySQL/MongoDB, and optional Azure + Terraform.

**New?** Follow **[docs/STEP_BY_STEP_GUIDE.md](docs/STEP_BY_STEP_GUIDE.md)** for a full walkthrough (local run + Azure).

## Quick start (Phase 3–5 — local, single origin via Kong)

1. Start all services (Kong, MySQL, MongoDB, RabbitMQ, joke, ETL, submit, moderate):
   ```bash
   docker compose up -d
   ```
2. Wait ~30s for health checks, then use **one origin** (Kong on port 80):
   - **Joke UI:** http://localhost/app/joke  
   - **Submit UI:** http://localhost/app/submit  
   - **Moderate UI:** http://localhost/app/moderate  
   - **Submit API docs:** http://localhost/docs  
   - **RabbitMQ management:** http://localhost:15672 (guest/guest)

Default database is **MySQL**. Joke and ETL read `DB_TYPE` and connect to the chosen store.

### Switching database (Phase 5 — dual DB)

- **MySQL (default):** `DB_TYPE` unset or `DB_TYPE=mysql`. No change needed.
- **MongoDB:** Set env and restart joke + ETL:
  ```bash
  export DB_TYPE=mongo
  export MONGO_URI=mongodb://172.28.0.12:27017/jokedb
  docker compose up -d joke etl
  ```
  Or add to a `.env` in the project root and run `docker compose up -d joke etl`.  
  Only one DB is *used* at a time; both MySQL and MongoDB containers run in the same compose so you can switch without changing the stack.

Direct backend ports (4000, 4200, 4100) remain exposed for debugging. Rate limit: 5 req/min on `/joke`. TLS: see **gateway/README.md**.

## Repo layout

- `services/joke` — GET /joke/:type, GET /types, UI
- `services/submit` — POST /submit, GET /types, GET /docs, UI
- `services/etl` — Consumes moderated queue → DB; publishes type_update (Option 4). Uses MySQL or MongoDB per `DB_TYPE`.
- `services/moderate` — Moderator UI + events (Option 4)
- `gateway/` — **Single** Kong declarative config (`kong.yml`) for local + VM; TLS notes in gateway/README.md
- `terraform/` — VNet + Kong VM (reusable: copy VM block to add moderate, submit, RabbitMQ later)

See **IMPLEMENTATION_PLAN.md** for phased plan and Option 4 requirements.

## Terraform (Kong VM)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # set subscription_id
terraform init && terraform plan && terraform apply
```

Outputs: Kong VM private IP, VNet ID. Add more VMs by copying the `kong_vm` block in `main.tf` and changing name/NIC (same subnet for private networking).

### If /app/joke shows "invalid response from upstream"

1. **Redeploy with latest code** (joke service now listens immediately so Kong gets a valid response; DB init runs in background). Push your repo, then run the command **on the Joke VM** (not on your laptop): Azure Portal → **jokes-joke-vm** → Run command → RunShellScript, and paste:
   ```bash
   cd /home/azureuser/app && git pull && cd deploy/joke && RABBITMQ_IP=10.0.1.5 docker compose up -d --build
   ```
   Use the `rabbitmq` value from `terraform output private_ips` if different.

2. **Check Joke VM** (Run command on `jokes-joke-vm`):
   ```bash
   docker ps -a
   tail -80 /var/log/joke-compose.log
   docker logs $(docker ps -aq -f name=joke | head -1) 2>/dev/null || true
   curl -s http://localhost:3000/health
   ```

## CD (GitHub Actions) without Azure app registration

CD runs on a **self-hosted runner** on the submit VM, using the VM’s **Managed Identity** so you don’t need Entra ID or `AZURE_CREDENTIALS`.

1. **Apply Terraform** so the submit VM exists (identity block is in Terraform, but the RBAC grant is done manually once):
   ```bash
   cd terraform && terraform apply
   ```

2. **One-time: enable identity + grant Contributor (from your laptop)**  
   Run once after Terraform has created the submit VM:
   ```bash
   SUB_ID="2961af5c-d1f2-45a5-8ca8-5eb62c22abd4"
   RG="jokes-rg"
   VM="jokes-submit-vm"

   # Enable system-assigned managed identity on the submit VM
   az vm identity assign -g "$RG" -n "$VM"

   # Get the managed identity's principalId
   PRINCIPAL_ID=$(az vm show -g "$RG" -n "$VM" --query "identity.principalId" -o tsv)

   # Grant Contributor on the resource group to that identity
   az role assignment create \
     --assignee-object-id "$PRINCIPAL_ID" \
     --assignee-principal-type ServicePrincipal \
     --role Contributor \
     --scope "/subscriptions/$SUB_ID/resourceGroups/$RG"
   ```

3. **One-time: install the runner on the submit VM**  
   SSH into the submit VM (e.g. via Bastion or a jump host), then follow **[docs/SELF_HOSTED_RUNNER_SETUP.md](docs/SELF_HOSTED_RUNNER_SETUP.md)** to install the GitHub Actions runner with label `azure` and (optional) Azure CLI for `az login --identity`.

4. **Optional:** In the repo’s GitHub **Settings → Secrets and variables → Actions**, add `AZURE_SUBSCRIPTION_ID` with your subscription ID if you have multiple subscriptions.

After that, pushes to `main` trigger the workflow on the self-hosted runner; it builds/pushes the moderate image and runs `az vm run-command` on the app VMs using the VM’s managed identity.

## Requirements

- Node 18+
- Docker & Docker Compose
- Terraform + Azure CLI (for VM deploy)
