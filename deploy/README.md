# Deploy per VM (Docker Compose)

One **docker-compose.yml** per VM. Terraform can run them for you, or you run them manually.

## Layout

| VM        | Folder           | What runs                          |
|-----------|------------------|------------------------------------|
| Kong      | `kong/`          | Kong (mounts kong.yml)              |
| RabbitMQ  | `rabbitmq/`      | RabbitMQ                            |
| Joke      | `joke/`          | MySQL + joke + ETL (build from repo)|
| Moderate  | `moderate/`      | moderate (build from repo)         |
| Submit    | `submit/`        | submit (build from repo)           |

## Option A: Terraform runs Compose (recommended)

1. **Kong and RabbitMQ**  
   Terraform always writes the compose file and runs `docker compose up -d` on those two VMs (no Git needed).

2. **Joke, Moderate, Submit**  
   Set `repo_url` in `terraform.tfvars` so Terraform can clone the repo and run compose (including `docker compose build`):

   ```hcl
   repo_url = "https://github.com/YOUR_USER/distributed-jokes.git"
   ```

   Then run:

   ```bash
   terraform apply
   ```

   Terraform will install Docker, then deploy Compose on all 5 VMs. For Joke/Moderate/Submit it clones the repo and runs `docker compose up -d --build` with the right private IPs.

   Use a **public** repo, or a URL with a token for a private repo.

## Option B: Run Compose yourself

If you leave `repo_url` empty, Terraform only installs Docker and runs Compose on **Kong** and **RabbitMQ**. For Joke, Moderate, and Submit you:

1. Copy the repo (or `deploy/` + `services/`) onto each VM (e.g. via Azure Run Command or Bastion).
2. On each VM, set env and run:

   **Joke VM** (from `deploy/joke/`):

   ```bash
   export RABBITMQ_IP=10.0.1.5
   docker compose up -d --build
   ```

   **Moderate VM** (from `deploy/moderate/`):

   ```bash
   export JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5
   docker compose up -d --build
   ```

   **Submit VM** (from `deploy/submit/`):

   ```bash
   export JOKE_IP=10.1.1.4 RABBITMQ_IP=10.0.1.5
   docker compose up -d --build
   ```

Use the private IPs from `terraform output private_ips` (e.g. 10.0.1.5, 10.1.1.4).
