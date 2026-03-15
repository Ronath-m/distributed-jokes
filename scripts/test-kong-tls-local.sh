#!/usr/bin/env bash
# Test Kong 3.4 with the same TLS config as deploy/kong (Azure). Run from repo root.
# If this passes, the same config should work on the VM. Takes ~30s.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
TESTDIR="${TESTDIR:-/tmp/kong-tls-test}"
echo "=== Kong TLS local test (same config as Azure) ==="
mkdir -p "$TESTDIR/certs"
if [ ! -f "$TESTDIR/certs/cert.pem" ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$TESTDIR/certs/cert.key" -out "$TESTDIR/certs/cert.pem" -subj "/CN=gateway"
fi
echo "Starting Kong 3.4 with TLS (ports 8000, 8443)..."
CONTAINER=$(docker run -d --rm \
  -p 18080:8000 -p 18443:8443 \
  -e KONG_DATABASE=off \
  -e KONG_DECLARATIVE_CONFIG=/kong/kong.yml \
  -e "KONG_PROXY_LISTEN=0.0.0.0:8000, 0.0.0.0:8443 ssl" \
  -e KONG_ADMIN_LISTEN=0.0.0.0:8444 \
  -e KONG_NGINX_PROXY_SSL_CERTIFICATE=/kong/certs/cert.pem \
  -e KONG_NGINX_PROXY_SSL_CERTIFICATE_KEY=/kong/certs/cert.key \
  -v "$REPO_ROOT/gateway/kong.yml:/kong/kong.yml:ro" \
  -v "$TESTDIR/certs:/kong/certs:ro" \
  kong:3.4)
trap "docker stop $CONTAINER 2>/dev/null || true" EXIT
echo "Waiting for Kong to start..."
sleep 5
echo "Testing HTTP (8000)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18080/ 2>/dev/null || echo "000")
echo " HTTP $HTTP_CODE"
echo "Testing HTTPS (8443)..."
HTTPS_CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1:18443/ || echo "000")
echo " HTTPS $HTTPS_CODE"
docker stop $CONTAINER 2>/dev/null || true
trap - EXIT
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "404" ] && [ "$HTTP_CODE" != "401" ]; then
  echo "FAIL: HTTP returned $HTTP_CODE (expected 200/404/401)"
  exit 1
fi
if [ "$HTTPS_CODE" != "200" ] && [ "$HTTPS_CODE" != "404" ] && [ "$HTTPS_CODE" != "401" ]; then
  echo "FAIL: HTTPS returned $HTTPS_CODE (expected 200/404/401). Kong may not have started with TLS."
  exit 1
fi
echo "PASS: Kong started with TLS. HTTP=$HTTP_CODE HTTPS=$HTTPS_CODE. Safe to deploy."
