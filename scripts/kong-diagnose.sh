#!/usr/bin/env bash
# Diagnose why Kong VM isn't reachable. Run from repo root. Requires: az login.
set -e
RG=jokes-rg
VM=jokes-kong-vm
echo "=== 1. Kong VM status (Azure) ==="
az vm show -g "$RG" -n "$VM" --query "{powerState:instanceView.statuses[?starts_with(code,'PowerState')].displayStatus, provisioningState:provisioningState}" -o table 2>/dev/null || true
echo ""
echo "=== 2. Kong public IP ==="
KONG_IP=$(az network public-ip list -g "$RG" --query "[?contains(name,'kong')].ipAddress" -o tsv | head -1)
echo "Kong PIP: $KONG_IP"
echo ""
echo "=== 3. Containers on Kong VM ==="
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript --query 'value[0].message' -o tsv --scripts "cd /home/azureuser/kong && docker compose ps -a 2>/dev/null || docker ps -a"
echo ""
echo "=== 4. Listening on 80 and 8443 (on VM) ==="
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript --query 'value[0].message' -o tsv --scripts "ss -tlnp | grep -E ':80|:8443' || true"
echo ""
echo "=== 5. Test from your Mac (curl to IP) ==="
echo "HTTP 80:"
curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://${KONG_IP}/" 2>/dev/null || echo "failed/timeout"
echo ""
echo "HTTPS 8443:"
curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 5 "https://${KONG_IP}:8443/" 2>/dev/null || echo "failed/timeout"
echo ""
echo "If 5 shows failed/timeout, Kong isn't reachable on the IP either (VM off, Kong down, or NSG)."
echo "If 5 works but FQDN times out, try: ping jokes-kong-ron.southeastasia.cloudapp.azure.com (should resolve to $KONG_IP)"
