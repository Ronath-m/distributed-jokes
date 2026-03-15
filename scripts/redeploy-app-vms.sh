#!/usr/bin/env bash
# Redeploy app VMs only (Moderate, Submit, Joke). Use when CD runner died after Kong VM update.
# Prereqs: az CLI, logged in (az login), same subscription as the VMs.
# For Moderate OIDC, set env: OIDC_ISSUER_BASE_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_SECRET (or source from .env.secrets)

set -e
RG=jokes-rg
KONG_IP=$(az network public-ip list -g "$RG" --query "[?contains(name,'kong')].ipAddress" -o tsv | head -1)
echo "Kong IP: ${KONG_IP}"

MOD_SCRIPT="cd /home/azureuser/app && git pull || true && export JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5"
if [ -n "$KONG_IP" ]; then
  MOD_SCRIPT="$MOD_SCRIPT OIDC_BASE_URL=http://${KONG_IP}/app/moderate"
fi
if [ -n "$OIDC_ISSUER_BASE_URL" ]; then
  MOD_SCRIPT="$MOD_SCRIPT OIDC_ISSUER_BASE_URL=$OIDC_ISSUER_BASE_URL OIDC_CLIENT_ID=${OIDC_CLIENT_ID:-moderate-app} OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:-} OIDC_SECRET=${OIDC_SECRET:-}"
fi
MOD_SCRIPT="$MOD_SCRIPT && cd /home/azureuser/app/deploy/moderate && docker compose up -d --build"

SUB_SCRIPT='cd /home/azureuser/app && git pull || true && cd /home/azureuser/app/deploy/submit && JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5 docker compose up -d --build'
JOKE_SCRIPT='cd /home/azureuser/app && git pull && cd /home/azureuser/app/deploy/joke && RABBITMQ_IP=10.0.1.5 docker compose up -d --build'

echo "=== Moderate VM ==="
az vm run-command invoke -g "$RG" -n jokes-moderate-vm --command-id RunShellScript --scripts "$MOD_SCRIPT"

echo "=== Submit VM ==="
az vm run-command invoke -g "$RG" -n jokes-submit-vm --command-id RunShellScript --scripts "$SUB_SCRIPT"

echo "=== Joke VM ==="
az vm run-command invoke -g "$RG" -n jokes-joke-vm --command-id RunShellScript --scripts "$JOKE_SCRIPT"

echo "Done."
