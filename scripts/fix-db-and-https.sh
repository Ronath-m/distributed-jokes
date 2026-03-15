#!/usr/bin/env bash
# 1) Restart Joke VM (MySQL + joke + ETL). 2) Ensure Kong VM uses LE cert and restart Kong.
# Run from repo root. Requires: az login.
set -e
RG=jokes-rg

echo "=== 1. Restarting Joke VM (MySQL + joke + ETL) ==="
az vm run-command invoke -g "$RG" -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'cd /home/azureuser/app/deploy/joke && docker compose up -d'
echo ""

echo "=== 2. Kong VM: verify LE cert and restart Kong ==="
az vm run-command invoke -g "$RG" -n jokes-kong-vm --command-id RunShellScript \
  --query 'value[0].message' -o tsv --scripts '
cd /home/azureuser/kong
echo "--- compose has LE cert vars? ---"
grep -E "KONG_NGINX_PROXY_SSL|certs" docker-compose.yml || true
echo "--- cert.pem subject (should show FQDN) ---"
openssl x509 -in certs/cert.pem -noout -subject -issuer 2>/dev/null || echo "cert not found or invalid"
echo "--- restarting Kong ---"
docker compose restart kong
echo "Kong restarted. Use https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443/app/joke (FQDN not IP)."
'
echo ""
echo "Done. Wait 30s then test: https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443/app/joke"
echo "Database (Joke VM): MySQL+joke+ETL restarted. Test: http://4.193.203.108/app/joke"
