# Terraform — Phase 6 multi-region Azure

Creates **5 VMs in 3 regions** (student subscription: 4 vCPUs per region; 2 vCPUs per VM).

| Region         | VMs        | Private IPs   |
|----------------|------------|---------------|
| Southeast Asia | Kong, RabbitMQ | 10.0.1.4, 10.0.1.5 |
| Central India | Joke+ETL+DB   | 10.1.1.4      |
| East Asia      | Moderate, Submit | 10.2.1.4, 10.2.1.5 |

- **Kong** has a **public IP** (single entry from internet).
- **VNets** are peered so all VMs can reach each other by private IP.

## Prerequisites

- Azure CLI logged in: `az login`
- SSH public key at `~/.ssh/id_rsa.pub` (or set `admin_ssh_public_key_path`)

## Apply

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: set subscription_id

terraform init
terraform plan
terraform apply
```

After apply, use `terraform output` to get:
- `kong_public_ip` — URL for the gateway (e.g. `http://<ip>`)
- `private_ips` — use these in Kong config and in each service’s env (DB_HOST, RABBITMQ_URL, JOKE_SERVICE_URL, etc.)

## Kong config on Azure

Replace Docker Compose IPs (172.28.0.x) with the Terraform `private_ips` output:

- `gateway/kong.yml`: set each service `url` to `http://<private_ip>:<port>` (joke 3000, submit 3200, moderate 3100).
- Or generate a Kong config from the outputs, e.g. `terraform output -json private_ips`.

## Deploying apps on the VMs

Terraform only provisions VMs and network. To run the stack:

1. **Install Docker** on each VM (e.g. SSH and run the [Docker install script](https://get.docker.com), or use cloud-init in a future TF update).
2. **Build and push** images to a registry (Docker Hub or ACR).
3. On each VM: **pull images**, set env vars (using `private_ips`), and **run containers** (e.g. docker run or a small compose per VM).

Example (after Docker is installed on each VM):

- **Joke VM:** MySQL + joke + ETL (same machine; use localhost for DB and RabbitMQ URL to 10.0.1.5).
- **RabbitMQ VM:** rabbitmq:3-management.
- **Moderate VM:** moderate container (RABBITMQ_URL=10.0.1.5, JOKE_SERVICE_URL=10.1.1.4:3000).
- **Submit VM:** submit container (RABBITMQ_URL=10.0.1.5, JOKE_SERVICE_URL=10.1.1.4:3000).
- **Kong VM:** Kong container with config pointing to 10.1.1.4:3000, 10.2.1.4:3100, 10.2.1.5:3200.

See project root **README** and **IMPLEMENTATION_PLAN.md** for the full pipeline (e.g. GitHub Actions build/push/deploy).
