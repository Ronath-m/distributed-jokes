# TLS/HTTPS on Kong (Azure) – Mid 2:1+ / Exceptional

The gateway exposes **HTTPS on port 8443** so you can demonstrate SSL/TLS for the assignment. The certificate lives **on the VM** (not in the Docker image), as required by the brief.

---

## What’s in place

- **Terraform**: NSG allows inbound **8443** (HTTPS) on the Kong VM.
- **deploy/kong/docker-compose.yml**: Kong listens on `0.0.0.0:8000` (HTTP) and `0.0.0.0:8443 ssl` (HTTPS). Cert and key are mounted from `./certs` and set via `KONG_SSL_CERT` and `KONG_SSL_CERT_KEY`.
- **Cert on VM**: A **self-signed** certificate is created on the Kong VM:
  - **Terraform** (first provision): CustomScript creates `/home/azureuser/kong/certs` and runs `openssl req -x509 ...` if `cert.pem` doesn’t exist.
  - **CD** (every Kong VM update): The workflow script creates `certs` and generates the cert if missing, then runs `docker compose up -d`.

So TLS is enabled with a **self-signed cert** for assessment. In production you would use **Let’s Encrypt** or another CA and (optionally) a domain name.

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
- Clarify that the **certificate is on the VM** (generated there, not baked into the image).
- Note that the current setup uses a **self-signed** cert for the assignment; production would use a CA (e.g. Let’s Encrypt) and a proper domain.
