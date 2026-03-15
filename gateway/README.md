# Kong API Gateway

Single declarative config: `kong.yml`. Used by Docker Compose (local) and by Kong on the Terraform-created VM (copy this folder + run Kong in Docker there).

## Local (Docker Compose)

- Kong listens on **80** (HTTP) and **8443** (HTTPS if configured).
- **Single origin:** `http://localhost`
  - Joke UI: http://localhost/app/joke
  - Submit UI: http://localhost/app/submit
  - APIs: `/joke/:type`, `/types`, `/submit`, `/docs`
- Rate limit: 5 req/min on `/joke` (easy to trigger for demo).

## TLS (Mid/High 2:1)

Certificate must be **on the VM**, not baked into the image.

### Local (mkcert)

```bash
# Install mkcert, then:
mkcert -install
mkcert localhost 127.0.0.1
# Creates localhost+1.pem, localhost+1-key.pem
```

Mount cert + key and set Kong to listen on 8443 with them (see [Kong SSL](https://docs.konghq.com/gateway/latest/configure/)). Optionally add a `kong-ssl.yml` snippet or env for cert paths.

### Azure VM (implemented for assignment)

- **Cert on VM**: A self-signed cert is created on the Kong VM at `/home/azureuser/kong/certs/` (by Terraform on first provision and by CD when updating). Not baked into the image.
- **Compose**: `deploy/kong/docker-compose.yml` mounts `./certs` and sets `KONG_PROXY_LISTEN=0.0.0.0:8000, 0.0.0.0:8443 ssl`, `KONG_SSL_CERT`, `KONG_SSL_CERT_KEY`.
- **Access**: HTTP on port 80, HTTPS on port **8443** (e.g. `https://<KONG_IP>:8443/app/moderate`). Browser will warn on self-signed cert; proceed for demo.
- See **docs/TLS_AZURE.md** for full details and report/video notes.
