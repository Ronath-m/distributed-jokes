#!/usr/bin/env bash
# Check what certificate Kong is actually presenting on 8443. Run from your Mac.
# If you see "Let's Encrypt" and the FQDN, Kong is serving the right cert (issue may be browser).
# If you see "Kong" or "localhost", Kong is not using the LE cert.
set -e
FQDN="${1:-jokes-kong-ron.southeastasia.cloudapp.azure.com}"
echo "Connecting to $FQDN:8443 and fetching the certificate..."
echo | openssl s_client -connect "$FQDN:8443" -servername "$FQDN" 2>/dev/null | openssl x509 -noout -subject -issuer -dates
echo ""
echo "If subject shows $FQDN and issuer shows Let's Encrypt, Kong is serving the correct cert."
echo "If subject shows localhost or Kong, Kong is not using the LE cert (need full container recreate)."
