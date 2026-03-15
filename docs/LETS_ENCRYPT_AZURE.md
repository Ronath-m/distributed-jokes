# Let's Encrypt (CA-signed cert) on Kong – Azure domain label

To get a **CA-signed certificate** (green padlock, no browser warning), use Azure’s **domain name label** on the Kong public IP so you get a FQDN like `<label>.<region>.cloudapp.azure.com`, then run **certbot** on the Kong VM during Terraform.

---

## 1. Set Terraform variables

In `terraform/terraform.tfvars` add (use your own label and email):

```hcl
# Let's Encrypt: Azure gives you <label>.<region>.cloudapp.azure.com
kong_domain_name_label = "jokes-kong-ron"   # must be unique in the region (e.g. southeastasia)
certbot_email          = "your.email@example.com"
```

- **kong_domain_name_label**: short name; Azure will create `<label>.southeastasia.cloudapp.azure.com` (region = `region_gateway`). Must be **unique** in that region.
- **certbot_email**: used by Let’s Encrypt for expiry/account emails.

---

## 2. Apply Terraform

```bash
cd terraform
terraform plan   # expect: Kong PIP gets domain_name_label, Kong VM extension runs certbot + LE compose
terraform apply
```

On first apply, the Kong VM will:

1. Install Docker and certbot  
2. Run **certbot certonly --standalone** for `<label>.<region>.cloudapp.azure.com` (port 80 must be free, so Kong is not started yet)  
3. Copy certs to `/home/azureuser/kong/certs/`  
4. Write Kong config and **docker-compose-le.yml** (cert mount + env)  
5. Start Kong with the Let’s Encrypt cert

Apply can take 10–20+ minutes. If certbot fails (e.g. “Unable to register an account with ACME server”), check outbound HTTPS from the VM and firewall/NSG.

---

## 3. Use the FQDN (and update Auth0)

After apply:

```bash
terraform output kong_fqdn
# e.g. jokes-kong-ron.southeastasia.cloudapp.azure.com
```

- **HTTPS:** `https://<kong_fqdn>:8443/app/joke`, `https://<kong_fqdn>:8443/app/moderate`, etc.  
- You should get a **green padlock** (Let’s Encrypt cert).

**Auth0 (OIDC):**  
Set your app’s **Allowed Callback URLs** and **Allowed Logout URLs** to use the FQDN, e.g.:

- `https://<kong_fqdn>:8443/app/moderate/callback`  
- `https://<kong_fqdn>:8443/app/moderate`  
- Base URL for the app: `https://<kong_fqdn>:8443/app/moderate`

Also set **OIDC_BASE_URL** (e.g. in CD or on the moderate VM) to `https://<kong_fqdn>:8443/app/moderate` so login redirects use HTTPS and the correct hostname.

---

## 4. CD and Kong

The CD workflow checks for `/home/azureuser/kong/certs/cert.pem` on the Kong VM. If it exists, it deploys **docker-compose-le.yml** (so Kong keeps using the Let’s Encrypt cert). If not, it deploys the default compose (Kong default cert).

---

## 5. Renewal

Let’s Encrypt certs last ~90 days. Renew by running certbot again on the Kong VM (Kong must not be using port 80), then copy certs and restart Kong. You can automate this with a cron job or a small script; details are left out here.
