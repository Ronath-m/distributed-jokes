# Debugging 502 Bad Gateway (nginx)

A **502 from nginx** means nginx could not get a valid response from Kong (its upstream). Kong then returns 502 when it cannot reach a backend (e.g. the moderate app). So the chain is:

**Browser → nginx:8443 → Kong:8000 → moderate @ 10.2.1.4:3100**

## 1. Check the moderate app (most likely)

On the **moderate VM**, the app must be running and listening on port 3100.

```bash
# Run on moderate VM (e.g. SSH or az vm run-command)
az vm run-command invoke -g jokes-rg -n jokes-moderate-vm --command-id RunShellScript \
  --scripts 'docker ps -a; echo "---"; docker logs $(docker ps -aq -f name=moderate) --tail 80'
```

- If the **moderate** container is **Exited**, check logs for crash (e.g. missing `OIDC_SECRET`, Auth0 config).
- If it’s **Up**, Kong should be able to reach it. Try from the **Kong VM** (next step).

## 2. Check Kong and nginx on the Kong VM

```bash
az vm run-command invoke -g jokes-rg -n jokes-kong-vm --command-id RunShellScript \
  --scripts 'cd /home/azureuser/kong && docker ps -a && echo "---" && curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/app/moderate 2>/dev/null || echo "Kong not reachable"'
```

- **nginx** and **kong** should both be **Up**. If Kong is down, fix Kong (compose/restart).
- If Kong returns 200 for `/app/moderate` from localhost but you still get 502 in the browser, the problem is likely **moderate** (Kong gets 502 from 10.2.1.4:3100).

## 3. Can Kong reach the moderate VM?

From the **Kong VM** (same run-command or SSH):

```bash
curl -s -o /dev/null -w "%{http_code}" http://10.2.1.4:3100/
```

- **200** → moderate is up; then 502 might be a specific route or timing issue.
- **000** or timeout → moderate is down, or firewall/NSG blocking Kong VM (10.0.1.4) from reaching 10.2.1.4.

## 4. Restart moderate (after fixing env)

If logs show missing env (e.g. OIDC), set secrets in GitHub and re-run CD, or run once on the moderate VM:

```bash
# Example: set OIDC and restart (replace with your values or use GitHub Secrets in CD)
az vm run-command invoke -g jokes-rg -n jokes-moderate-vm --command-id RunShellScript --scripts '
  cd /home/azureuser/app/deploy/moderate &&
  export JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5 &&
  export OIDC_BASE_URL=https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443/app/moderate &&
  export OIDC_ISSUER_BASE_URL="YOUR_AUTH0_ISSUER" &&
  export OIDC_CLIENT_ID="YOUR_CLIENT_ID" &&
  export OIDC_CLIENT_SECRET="YOUR_CLIENT_SECRET" &&
  export OIDC_SECRET="YOUR_APP_SECRET" &&
  docker compose up -d --build
'
```

## 5. CD and Kong compose

CD is now set to use **docker-compose-le-nginx.yml** when `certs/cert.pem` exists on the Kong VM, so 8443 stays nginx+TLS and is not overwritten by Kong-only compose. After the next successful CD, re-check Kong VM with step 2.

---

# "Database not ready yet" (Joke VM)

The joke service returns this when it cannot connect to MySQL or run schema/seed. MySQL + joke + ETL run on the **Joke VM** (`jokes-joke-vm`).

**Check containers and joke logs:**

```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'docker ps -a; echo "---JOKE LOGS---"; docker logs joke-joke-1 --tail 80 2>&1'
```

If **mysql** or **joke** is Exited, or joke logs show connection errors, restart the stack:

```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'cd /home/azureuser/app/deploy/joke && RABBITMQ_IP=10.0.1.5 docker compose up -d'
```

Wait ~30 seconds for MySQL to accept connections and the joke service to set `dbReady`, then try the app again.
