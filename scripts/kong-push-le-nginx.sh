#!/usr/bin/env bash
# Deploy Kong + Nginx: Nginx terminates TLS with Let's Encrypt (fixes Kong default-cert bug).
# Run from repo root. Pushes docker-compose-le-nginx.yml + nginx-ssl.conf to Kong VM.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
COMPOSE_FILE="deploy/kong/docker-compose-le-nginx.yml"
NGINX_CONF="deploy/kong/nginx-ssl.conf"
for f in "$COMPOSE_FILE" "$NGINX_CONF"; do
  [ -f "$f" ] || { echo "Missing $f"; exit 1; }
done
B64_COMPOSE=$(base64 < "$COMPOSE_FILE" | tr -d '\n')
B64_NGINX=$(base64 < "$NGINX_CONF" | tr -d '\n')
echo "Pushing Kong+Nginx (Nginx does TLS with LE cert)..."
az vm run-command invoke -g jokes-rg -n jokes-kong-vm --command-id RunShellScript \
  --scripts "cd /home/azureuser/kong && docker compose down --remove-orphans 2>/dev/null; echo '$B64_COMPOSE' | base64 -d > docker-compose.yml && echo '$B64_NGINX' | base64 -d > nginx-ssl.conf && docker compose up -d"
echo "Done. Nginx serves your LE cert on 8443. Test: https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443/app/joke"
