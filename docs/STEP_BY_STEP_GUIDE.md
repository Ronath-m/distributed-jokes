# Step-by-step guide — what to do

Use this in order. Do **Part A** first (local), then **Part B** when you want to run on Azure.

---

## Part A: Run and test on your machine (no Azure)

### Step 1: Install what you need

- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop). Install and start it.
- **Node.js 18+** — only if you want to run services without Docker; optional.

### Step 2: Start the whole app locally

Open a terminal in the project folder (where `docker-compose.yml` is) and run:

```bash
docker compose up -d
```

Wait about 30 seconds for everything to start.

### Step 3: Check it works

In your browser open:

- **http://localhost/app/joke** — get a joke
- **http://localhost/app/submit** — submit a joke
- **http://localhost/app/moderate** — approve jokes

If these load, the app is working locally.

### Step 4: Try the full flow (optional)

1. On **http://localhost/app/submit** — submit a new joke (any setup, punchline, type).
2. On **http://localhost/app/moderate** — click “Get next”, then “Approve”.
3. On **http://localhost/app/joke** — pick that type and “Get a joke”. You should see the joke you approved.

### Step 5: Switch database (optional, Phase 5)

- **MySQL (default):** already in use after Step 2.
- **MongoDB:** in the same folder run:
  ```bash
  DB_TYPE=mongo MONGO_URI=mongodb://172.28.0.12:27017/jokedb docker compose up -d joke etl
  ```
  Then open http://localhost/app/joke again; data is now from MongoDB.

To go back to MySQL:

```bash
 docker compose up -d joke etl
```

---

## Part B: Run on Azure (Phase 6)

Only do this when Part A works and you want the app in the cloud.

### Step 1: Azure account and CLI

- You need an **Azure subscription** (e.g. student).
- Install **Azure CLI**: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli  
- Log in:
  ```bash
  az login
  ```
- Get your subscription ID:
  ```bash
  az account show --query id -o tsv
  ```
  Copy that value.

### Step 2: SSH key (for logging into VMs)

- If you don’t have an SSH key:
  ```bash
  ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
  ```
- Your **public** key is at: `~/.ssh/id_rsa.pub`. Terraform will use this.

### Step 3: Terraform variables

In the project folder:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` in a text editor and set:

```hcl
subscription_id = "paste-your-subscription-id-here"
```

Save the file. Do **not** commit `terraform.tfvars` (it’s in `.gitignore` if you add it).

### Step 4: Create the Azure VMs and network

In the same `terraform` folder:

```bash
terraform init
terraform plan
```

Read the plan (it will create a resource group, 3 VNets, 5 VMs, etc.). If it looks fine:

```bash
terraform apply
```

Type `yes` when asked. Wait until it finishes (several minutes).

### Step 5: Note the IPs

Run:

```bash
terraform output
```

You’ll see:

- **kong_public_ip** — use this in the browser later (e.g. `http://<that-ip>`).
- **private_ips** — Kong and the apps use these to talk to each other.

Keep this output; you’ll need it when you install Docker and run the app on the VMs.

### Step 6: Install Docker on each VM

You have 5 VMs. For each one you must:

1. SSH in (use the **private** IP from `terraform output private_ips`; you’ll need to be on a machine that can reach the VNet, or use Azure Bastion / “Run command” if you have it).
2. Install Docker.

**Option A — SSH from your laptop (if you have a way to reach private IPs, e.g. VPN or Bastion):**

```bash
ssh azureuser@<private_ip>
```

Then on the VM:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
```

Repeat for all 5 private IPs (Kong, RabbitMQ, Joke, Moderate, Submit).

**Option B — Use Azure “Run command” (no SSH needed):**

1. In Azure Portal go to the VM → **Operations** → **Run command**.
2. Choose **RunShellScript**.
3. Run:
   ```bash
   curl -fsSL https://get.docker.com | sh
   usermod -aG docker azureuser
   ```
4. Repeat for each of the 5 VMs.

### Step 7: Copy Kong config to the Kong VM

On your laptop you have a Kong config that uses Azure IPs:

- File: **gateway/kong-azure.example.yml**

The Kong VM needs this file as its Kong config. So:

1. Copy `gateway/kong-azure.example.yml` to your Kong VM (e.g. with `scp` if you can SSH):
   ```bash
   scp gateway/kong-azure.example.yml azureuser@<KONG_PUBLIC_IP>:/home/azureuser/kong.yml
   ```
   (If you only have public IP for Kong, use that for this copy.)

2. On the Kong VM, run Kong with that config (see Step 8 for an example run).

### Step 8: Run the app on each VM

You need to run the right containers on each VM and point them at the **private IPs** from Step 5.

**On RabbitMQ VM (10.0.1.5):**

```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

**On Joke VM (10.1.1.4):**  
Run MySQL, then Joke, then ETL. Use `RABBITMQ_URL=amqp://guest:guest@10.0.1.5:5672` for ETL so it talks to RabbitMQ.

Example (after building or pulling your images):

```bash
docker run -d --name mysql -e MYSQL_ROOT_PASSWORD=rootpass -e MYSQL_DATABASE=jokedb -e MYSQL_USER=jokeuser -e MYSQL_PASSWORD=jokepass mysql:8
# wait ~30s for MySQL to be ready, then:
docker run -d --name joke -p 3000:3000 --add-host=host.docker.internal:host-gateway -e DB_HOST=... <your-joke-image>
docker run -d --name etl -e DB_HOST=... -e RABBITMQ_URL=amqp://guest:guest@10.0.1.5:5672 <your-etl-image>
```

(Replace `<your-joke-image>` and DB_HOST with your actual image name and MySQL IP/host.)

**On Moderate VM (10.2.1.4):**

```bash
docker run -d --name moderate -p 3100:3100 \
  -e RABBITMQ_URL=amqp://guest:guest@10.0.1.5:5672 \
  -e JOKE_SERVICE_URL=http://10.1.1.4:3000 \
  <your-moderate-image>
```

**On Submit VM (10.2.1.5):**

```bash
docker run -d --name submit -p 3200:3200 \
  -e RABBITMQ_URL=amqp://guest:guest@10.0.1.5:5672 \
  -e JOKE_SERVICE_URL=http://10.1.1.4:3000 \
  <your-submit-image>
```

**On Kong VM (10.0.1.4, has public IP):**

```bash
docker run -d --name kong -p 80:8000 -p 8443:8443 \
  -v /home/azureuser/kong.yml:/kong/kong.yml:ro \
  -e KONG_DATABASE=off \
  -e KONG_DECLARATIVE_CONFIG=/kong/kong.yml \
  -e KONG_PROXY_LISTEN=0.0.0.0:8000 \
  kong:3.4
```

Use the **same** private IPs as in **gateway/kong-azure.example.yml** (10.1.1.4, 10.2.1.4, 10.2.1.5).

### Step 9: Open the app in the browser

Use the **Kong public IP** from Step 5:

- **http://&lt;kong_public_ip&gt;/app/joke**
- **http://&lt;kong_public_ip&gt;/app/submit**
- **http://&lt;kong_public_ip&gt;/app/moderate**

If they load, the app is running on Azure.

---

## Quick reference

| Goal                    | What to run / open |
|-------------------------|--------------------|
| Run locally             | `docker compose up -d` then http://localhost/app/joke |
| Stop locally            | `docker compose down` |
| Create Azure VMs        | `cd terraform` → `terraform init` → `terraform apply` |
| See Azure IPs           | `terraform output` (in `terraform` folder) |
| Destroy Azure resources | `cd terraform` → `terraform destroy` |

---

## If something fails

- **Docker: “Cannot connect”** — Make sure Docker Desktop is running (Part A).
- **Terraform: “subscription not found”** — Check `subscription_id` in `terraform.tfvars` and that you’re logged in with `az login`.
- **Terraform: “quota” or “vCPU”** — Your subscription has 4 vCPUs per region; the guide uses 2 VMs in Southeast Asia, 2 in East Asia, 1 in Central India. If one region fails, try changing `region_*` in `terraform.tfvars` to another region you’re allowed to use.
- **Browser: “can’t reach Kong”** — Confirm Kong VM has a public IP, port 80 is open (Azure NSG), and Kong container is running with the correct config.

For more detail on Terraform and IPs, see **terraform/README.md**. For the overall plan, see **IMPLEMENTATION_PLAN.md**.
