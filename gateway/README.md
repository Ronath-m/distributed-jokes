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

### Azure VM (Let's Encrypt or self-signed)

- Copy cert + key to the Kong VM (e.g. `/opt/kong/cert.pem`, `/opt/kong/cert.key`).
- Run Kong with `KONG_PROXY_LISTEN=0.0.0.0:8000, 0.0.0.0:8443 ssl` and point to those files (declarative cert or env).
