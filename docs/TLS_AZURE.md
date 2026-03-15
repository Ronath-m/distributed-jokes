# TLS/HTTPS on Kong (Azure) – Mid 2:1+ / Exceptional

The gateway exposes **HTTPS on port 8443** so you can demonstrate SSL/TLS for the assignment. The certificate is **not in the Docker image**: Kong generates its default self-signed cert at runtime when it starts on the VM, as required by the brief.

---

## What’s in place

- **Terraform**: NSG allows inbound **8443** (HTTPS) on the Kong VM.
- **deploy/kong/docker-compose.yml**: Kong listens on `0.0.0.0:8000` (HTTP) and `0.0.0.0:8443 ssl` (HTTPS). No custom cert is mounted; Kong uses its **default TLS certificate** (created when Kong starts on the VM).
- **CD**: The workflow downloads `docker-compose.yml` and `kong.yml` onto the Kong VM and runs `docker compose up -d`. No cert generation step—Kong starts reliably and enables TLS on 8443 with its built-in default cert.

So TLS is enabled with Kong's **default self-signed cert** for assessment. In production you would use **Let’s Encrypt** or another CA and (optionally) a domain name.

---

## Test locally before deploying (~30 s)

To avoid a 40‑minute deploy only to find Kong won’t start with TLS, run the same Kong config in Docker on your machine:

```bash
# From repo root; requires Docker running
./scripts/test-kong-tls-local.sh
```

This script runs Kong 3.4 with the same config as Azure (proxy listen 8000 + 8443 ssl, Kong default cert), then checks HTTP and HTTPS. If it prints **PASS**, the Azure deploy should work. If it fails, fix the config and re-run until it passes.

---

## How to use it

1. Get the Kong public IP (e.g. `terraform output kong_public_ip` or Azure portal).
2. **HTTP (port 80):**  
   `http://<KONG_IP>/app/joke`, `http://<KONG_IP>/app/submit`, `http://<KONG_IP>/app/moderate`
3. **HTTPS (port 8443):**  
   `https://<KONG_IP>:8443/app/joke`, `https://<KONG_IP>:8443/app/submit`, `https://<KONG_IP>:8443/app/moderate`

Browsers will show a warning for the self-signed cert; choose “Advanced” → “Proceed to …” for the demo.

---

## For the report / video

- State that TLS is enabled on the gateway (Kong listening on 8443 with a certificate).
- Clarify that the **certificate is not in the image** (Kong generates its default cert at runtime when it starts on the VM).
- Note that the current setup uses a **self-signed** cert for the assignment; production would use a CA (e.g. Let’s Encrypt) and a proper domain.
