# OIDC on Azure – do these steps in order

Nothing here changes your existing VMs or apps except adding Keycloak and enabling login for the moderator. Do the steps in order.

---

## Step 1: Open port 8080 (Terraform)

So the Kong VM can serve Keycloak on 8080.

```bash
cd terraform
terraform apply
```

Approve if it only shows the new NSG rule (allow 8080). No VMs are recreated.

---

## Step 2: Push to main (start Keycloak on Kong VM)

CD will update the Kong VM with the latest compose (Kong + Keycloak) and restart it.

```bash
git add .github/workflows/cd.yml docs/OIDC_AZURE_STEPS.md
git commit -m "CD: update Kong VM with Keycloak compose"
git push origin main
```

Wait for the workflow to finish (Actions tab). Then wait ~60s for Keycloak to start.

**If your repo is private:** the Kong VM can’t download the compose from GitHub. Then do Step 2b instead.

**Step 2b (only if repo is private):** SSH to the Kong VM and update the compose by hand:

```bash
ssh azureuser@<KONG_PUBLIC_IP>
# On the VM:
cd /home/azureuser/kong
# Replace docker-compose.yml with the one from your repo that includes the keycloak service, then:
docker compose up -d
exit
```

---

## Step 3: Configure Keycloak in the browser

1. Get your Kong public IP:  
   `cd terraform && terraform output kong_public_ip`  
   (e.g. `4.193.203.108`)

2. Open **http://\<KONG_IP\>:8080** (e.g. http://4.193.203.108:8080).

3. **Administration Console** → log in **admin** / **admin**.

4. Create realm **jokes** (Realm name = `jokes` → Create).

5. In realm **jokes** → **Clients** → **Create client**:
   - Client ID: **moderate-app**
   - Client type: **OpenID Connect**
   - Next → **Valid redirect URIs**:  
     `http://<KONG_IP>/app/moderate/callback`  
     `http://<KONG_IP>/app/moderate/*`  
     (use your real IP, e.g. `http://4.193.203.108/app/moderate/callback`)
   - Next → **Client authentication** ON → Save.

6. Open client **moderate-app** → **Credentials** tab → copy the **Secret**. You’ll use it in Step 4.

---

## Step 4: Add GitHub Secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name               | Value |
|--------------------|--------|
| **OIDC_CLIENT_SECRET** | The Secret from Keycloak (Step 3). |
| **OIDC_SECRET**        | Any long random string (e.g. run `openssl rand -hex 32` and paste). |

---

## Step 5: Trigger CD again (moderator gets OIDC)

So the moderate VM is redeployed with the secrets.

```bash
git commit --allow-empty -m "Trigger CD for OIDC secrets"
git push origin main
```

Wait for the workflow to finish.

---

## Step 6: Create a user in Keycloak (so you can log in)

1. Open **http://\<KONG_IP\>:8080** → **Administration Console** → realm **jokes**.
2. **Users** → **Create user** → set Username (e.g. `moderator`) → Create.
3. Open the user → **Credentials** tab → **Set password** (e.g. `moderator1`) → turn off “Temporary” → Save.

---

## Step 7: Test

1. Open **http://\<KONG_IP\>/app/moderate** (e.g. http://4.193.203.108/app/moderate).
2. You should be redirected to Keycloak. Log in with the user from Step 6.
3. You should land on the moderator UI. Use “Log out” to confirm logout.

---

## If something fails

- **Keycloak not loading (http://\<KONG_IP\>:8080):** Port 8080 might still be closed. Run Step 1 again; check the Kong VM has the new compose (Step 2 / 2b).
- **Moderator still open (no redirect to login):** Check GitHub Secrets (Step 4) and that CD ran after adding them (Step 5). Check workflow logs for the “Trigger redeploy” step.
- **Redirect/callback error:** In Keycloak, check **moderate-app** → **Valid redirect URIs** exactly: `http://<KONG_IP>/app/moderate/callback` and `http://<KONG_IP>/app/moderate/*` (same IP as in the browser).
