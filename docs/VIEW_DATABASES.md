# Where to see MySQL and MongoDB

**On Azure:** Both **MySQL** and **MongoDB** run on the **Joke VM** (`deploy/joke/docker-compose.yml`). Ports 3306 and 27017 are exposed so you can connect via SSH tunnel (see **docs/SHOW_BOTH_DATABASES_WORKBENCH_COMPASS.md** for Workbench and Compass).

## MySQL (production – Azure Joke VM)

- **Where:** Runs in Docker on **Joke VM** (`jokes-joke-vm`, private IP 10.1.1.4), container `joke-mysql-1`.
- **Not exposed** to the internet (port 3306 is only inside the VM’s Docker network).

### View data via Azure run-command (no SSH)

From your Mac (with Azure CLI logged in):

```bash
# List tables
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'docker exec joke-mysql-1 mysql -u jokeuser -pjokepass jokedb -e "SHOW TABLES;"'

# Sample jokes
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'docker exec joke-mysql-1 mysql -u jokeuser -pjokepass jokedb -e "SELECT id, type, LEFT(text, 50) FROM jokes LIMIT 5;"'
```

### GUI (MySQL Workbench, DBeaver, etc.)

You need a path into the Joke VM (it has no public IP):

- **Option A – SSH tunnel via Submit VM:**  
  SSH to Submit VM (it has a public IP), then from there either run `mysql` in a tunnel, or use a **reverse tunnel** so your laptop can reach MySQL (e.g. on Submit: `ssh -L 3307:10.1.1.4:3000 azureuser@...` doesn’t give MySQL; you’d need something like `ssh -R 3307:mysql:3306 azureuser@submit-vm` from the Joke VM, which is more involved).  
  Simpler: from your Mac, **port-forward via the joke service** (which is reachable through Kong): you can’t get to MySQL directly without being on a VM that can reach 10.1.1.4.
- **Option B – Azure Bastion:**  
  If you enable Bastion for the VNet, you can RDP/SSH to the Joke VM and run `docker exec -it joke-mysql-1 mysql -u jokeuser -pjokepass jokedb` there, or install a GUI on the VM.

So in practice, **viewing MySQL on Azure** is easiest with the `az vm run-command` + `docker exec` examples above.

---

## MongoDB

- **Where (Azure):** Runs on the **Joke VM** alongside MySQL (`deploy/joke/docker-compose.yml`, service `mongo`). Port **27017** is exposed; connect via SSH tunnel (see **docs/SHOW_BOTH_DATABASES_WORKBENCH_COMPASS.md**).
- **Where (local dev):** The root `docker-compose.yml` also runs MongoDB (service `mongo`, image `mongo:7`).

### View MongoDB locally

1. From repo root: `docker compose up -d` (so mysql + mongo + joke + etl + … are up).
2. Connect to MongoDB:
   - **CLI:**  
     `docker exec -it distributed-jokes-mongo-1 mongosh jokedb --eval "db.jokes.find().limit(3)"`  
     (container name may vary; use `docker ps` to get the mongo container name.)
   - **GUI:** Use [MongoDB Compass](https://www.mongodb.com/products/compass) with URI `mongodb://localhost:27017/jokedb` (if you expose 27017 in `docker-compose.yml`). Default root `docker-compose.yml` may not publish 27017; add under the mongo service: `ports: - "27017:27017"` to connect from the host.

### Use MongoDB for the joke service locally

- `DB_TYPE=mongo MONGO_URI=mongodb://mongo:27017/jokedb docker compose up -d joke etl`  
  (from repo root; `mongo` is the service name in the same compose.)

---

## Summary

| Database | Azure (VMs)              | Local (docker-compose)     |
|----------|--------------------------|-----------------------------|
| **MySQL** | Joke VM, `joke-mysql-1`; port 3306; view via run-command or SSH tunnel + Workbench | `mysql` service, port 3306 (if exposed) |
| **MongoDB** | Joke VM, `joke-mongo-1`; port 27017; SSH tunnel + Compass (see SHOW_BOTH_DATABASES_WORKBENCH_COMPASS.md) | `mongo` service; add `ports: ["27017:27017"]` to connect from host |
