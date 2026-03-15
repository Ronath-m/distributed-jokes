#!/usr/bin/env bash
# On Kong VM: switch to LE compose and restart Kong so it uses cert.pem/cert.key. Run via: az vm run-command (see docs).
set -e
cd /home/azureuser/kong
curl -sL -o docker-compose.yml 'https://raw.githubusercontent.com/Ronath-m/distributed-jokes/main/deploy/kong/docker-compose-le.yml'
docker compose up -d kong
echo "Kong restarted with Let's Encrypt cert. Test: https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443/app/joke"
