# Finalise the assignment – do this now

Use this order so the deployed system is up and you can record the video / finish the report.

---

## 1. Azure Portal – VMs running

- Go to **Azure Portal** → **Virtual machines** → filter by resource group **jokes-rg**.
- Every VM must be **Running** (not Stopped): **jokes-kong-vm**, **jokes-rabbitmq-vm**, **jokes-joke-vm**, **jokes-moderate-vm**, **jokes-submit-vm**.
- If any is **Stopped**, select it → **Start**, wait until Status = Running.

---

## 2. Bring all containers up

From your machine (with `az` CLI installed and `az login` done):

```bash
cd /path/to/distributed-jokes

# Optional: set OIDC for moderate (if you use Auth0). Otherwise moderate runs without login.
# export OIDC_ISSUER_BASE_URL="https://your-tenant.auth0.com"
# export OIDC_CLIENT_ID="..."
# export OIDC_CLIENT_SECRET="..."
# export OIDC_SECRET="..."

chmod +x scripts/ensure-all-vms-up.sh
./scripts/ensure-all-vms-up.sh
```

- This runs `docker compose up -d` (or `up -d --build`) on each VM so all containers are running.
- Script prints the Kong IP at the end.

---

## 3. Wait 2–3 minutes

App VMs (joke, moderate, submit) may take 1–3 minutes to be ready after `docker compose up -d --build`.

---

## 4. Test the URLs

Replace `<KONG_IP>` with the IP from step 2 (e.g. `4.193.203.108`).

| What        | HTTP (port 80)              | HTTPS (Secure, port 8443)                  |
|------------|-----------------------------|--------------------------------------------|
| Joke       | http://&lt;KONG_IP&gt;/app/joke   | https://&lt;KONG_IP&gt;:8443/app/joke   |
| Submit     | http://&lt;KONG_IP&gt;/app/submit | https://&lt;KONG_IP&gt;:8443/app/submit |
| Moderate   | http://&lt;KONG_IP&gt;/app/moderate | https://&lt;KONG_IP&gt;:8443/app/moderate |

- For **HTTPS**: browser will warn about self-signed cert → **Advanced** → **Proceed to …**.
- If something doesn’t load: wait another minute and retry, or run step 2 again.

---

## 5. OIDC (if required)

- Open **http://&lt;KONG_IP&gt;/app/moderate** (or HTTPS).
- You should be redirected to Auth0 (or your IdP) to log in, then back to the moderator UI.
- If you didn’t set OIDC env in step 2, moderate may load without login (depending on your app config).

---

## 6. Submission checklist

- **Report**: Word, front sheet + auth, max 2000 words.
- **Video**: .mp4, max 15 min (Option 4), upload to Blackboard.
- **Zip**: source + .env, package.json, Dockerfiles, compose, DB exports; no node_modules, no .terraform.
- **Verification**: Tick off `docs/ASSIGNMENT_VERIFICATION.md` as you demo each item in the video.

---

## If something still times out

1. Run `./scripts/ensure-all-vms-up.sh` again.
2. Check containers on a VM, e.g. Kong:
   ```bash
   az vm run-command invoke -g jokes-rg -n jokes-kong-vm --command-id RunShellScript --query 'value[0].message' -o tsv --scripts "cd /home/azureuser/kong && docker compose ps -a"
   ```
3. Try again in a few minutes (VMs can be slow under load).
