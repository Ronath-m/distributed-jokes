# Azure moderator login with Auth0 (hosted OIDC)

Use **Auth0** (free tier) as the identity provider so the moderator on Azure requires login. No Keycloak on your VM – works with 1GB RAM.

---

## 1. Create an Auth0 account and application

1. Go to **https://auth0.com** and sign up (free).
2. In the dashboard: **Applications** → **Applications** → **Create Application**.
3. Name it e.g. **Moderator Azure**, choose **Regular Web Applications** → **Create**.
4. Open the new application → **Settings**.
5. **Application Type:** Regular Web Application (already set).
6. **Allowed Callback URLs:** add (use your Kong public IP):
   ```
   http://4.193.203.108/app/moderate/callback
   ```
   If your Kong IP is different, use `http://<YOUR_KONG_IP>/app/moderate/callback`.
7. **Allowed Logout URLs:** add:
   ```
   http://4.193.203.108/app/moderate
   ```
8. **Save Changes**.
9. Stay on **Settings** and copy:
   - **Domain** (e.g. `dev-xxxxxx.us.auth0.com`)
   - **Client ID**
   - **Client Secret** (click “Show” and copy).

---

## 2. GitHub Secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add:

| Secret name | Value |
|-------------|--------|
| **OIDC_ISSUER_BASE_URL** | `https://YOUR_DOMAIN` (no path, no trailing slash). Example: `https://dev-xxxxxx.us.auth0.com` |
| **OIDC_CLIENT_ID** | Auth0 **Client ID** |
| **OIDC_CLIENT_SECRET** | Auth0 **Client Secret** |
| **OIDC_SECRET** | Any long random string (e.g. run `openssl rand -hex 32` and paste) |

---

## 3. Trigger CD

Push to `main` so the workflow redeploys the moderate VM with these env vars:

```bash
git commit --allow-empty -m "Trigger CD for Auth0 OIDC"
git push origin main
```

Wait for the workflow to finish.

---

## 4. Create a user in Auth0 (to log in)

1. Auth0 dashboard → **User Management** → **Users** → **Create User**.
2. Email and password (or use a social connection if you enabled one).
3. Create. Use this user to log in to the moderator.

---

## 5. Test

1. Open **http://4.193.203.108/app/moderate** (or your Kong IP).
2. You should be redirected to Auth0 to log in.
3. After login, you should land on the moderator UI. Use **Log out** to confirm.

---

## If your Kong IP changes

Update in Auth0:

- **Applications** → your app → **Settings** → **Allowed Callback URLs** and **Allowed Logout URLs** with the new `http://<NEW_IP>/app/moderate/callback` and `http://<NEW_IP>/app/moderate`.

GitHub Secrets do **not** need the Kong IP for the issuer (Auth0 is hosted). Only **OIDC_BASE_URL** is built from the Kong IP in the CD workflow so the moderator still gets the right callback URL.
