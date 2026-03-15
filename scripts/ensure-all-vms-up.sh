#!/usr/bin/env bash
# Bring all containers up on all VMs. Run when you get timeouts or need to finalise.
# Prereqs: az login, resource group jokes-rg. For OIDC on moderate, set OIDC_ISSUER_BASE_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_SECRET (or export from GitHub Secrets / .env).

set -e
RG=jokes-rg

echo "=== Kong VM (gateway) ==="
az vm run-command invoke -g "$RG" -n jokes-kong-vm --command-id RunShellScript --scripts "cd /home/azureuser/kong && docker compose up -d"
echo "=== RabbitMQ VM ==="
az vm run-command invoke -g "$RG" -n jokes-rabbitmq-vm --command-id RunShellScript --scripts "cd /home/azureuser/rabbitmq && docker compose up -d"

KONG_IP=$(az network public-ip list -g "$RG" --query "[?contains(name,'kong')].ipAddress" -o tsv | head -1)
echo "Kong IP: ${KONG_IP}"

MOD_SCRIPT="cd /home/azureuser/app && git pull || true && export JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5"
[ -n "$KONG_IP" ] && MOD_SCRIPT="$MOD_SCRIPT OIDC_BASE_URL=http://${KONG_IP}/app/moderate"
[ -n "$OIDC_ISSUER_BASE_URL" ] && MOD_SCRIPT="$MOD_SCRIPT OIDC_ISSUER_BASE_URL=$OIDC_ISSUER_BASE_URL OIDC_CLIENT_ID=${OIDC_CLIENT_ID:-moderate-app} OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:-} OIDC_SECRET=${OIDC_SECRET:-}"
MOD_SCRIPT="$MOD_SCRIPT && cd /home/azureuser/app/deploy/moderate && docker compose up -d --build"

echo "=== Joke VM ==="
az vm run-command invoke -g "$RG" -n jokes-joke-vm --command-id RunShellScript --scripts 'cd /home/azureuser/app && git pull && cd /home/azureuser/app/deploy/joke && RABBITMQ_IP=10.0.1.5 docker compose up -d --build'
echo "=== Moderate VM ==="
az vm run-command invoke -g "$RG" -n jokes-moderate-vm --command-id RunShellScript --scripts "$MOD_SCRIPT"
echo "=== Submit VM ==="
az vm run-command invoke -g "$RG" -n jokes-submit-vm --command-id RunShellScript --scripts 'cd /home/azureuser/app && git pull || true && cd /home/azureuser/app/deploy/submit && JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5 docker compose up -d --build'

echo ""
echo "Done. Wait 2–3 minutes, then test:"
echo "  http://${KONG_IP}/app/joke   https://${KONG_IP}:8443/app/joke"
echo "  http://${KONG_IP}/app/submit  http://${KONG_IP}/app/moderate"
