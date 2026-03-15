#!/usr/bin/env bash
# Push deploy/kong/docker-compose-le.yml to Kong VM and restart Kong (so LE cert is used).
# Run from repo root. Requires: az login, deploy/kong/docker-compose-le.yml present.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
COMPOSE_FILE="deploy/kong/docker-compose-le.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing $COMPOSE_FILE"
  exit 1
fi
# Base64 so we don't rely on raw GitHub (which can 404)
B64=$(base64 < "$COMPOSE_FILE" | tr -d '\n')
echo "Pushing Kong-only LE compose (removes Keycloak), restarting Kong..."
az vm run-command invoke -g jokes-rg -n jokes-kong-vm --command-id RunShellScript \
  --scripts "cd /home/azureuser/kong && docker compose down --remove-orphans && echo '$B64' | base64 -d > docker-compose.yml && docker compose up -d"
echo "Done. Keycloak removed; only Kong running with LE cert. Test: https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443/app/joke"
