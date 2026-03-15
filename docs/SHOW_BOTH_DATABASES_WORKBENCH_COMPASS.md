# Showing both databases (MySQL and MongoDB) being updated – Workbench & Compass

This covers the brief requirement to demonstrate both databases being updated using **MySQL Workbench** (or similar) and **MongoDB Compass**.

## 1. Ensure both DBs run on Azure (Joke VM)

The Joke VM runs **MySQL** and **MongoDB** in the same Docker Compose (`deploy/joke/docker-compose.yml`). Ports **3306** (MySQL) and **27017** (MongoDB) are exposed on the Joke VM host so you can connect via SSH tunnel.

If you just added MongoDB or changed the compose, redeploy the Joke stack:

```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'cd /home/azureuser/app/deploy/joke && git pull && RABBITMQ_IP=10.0.1.5 docker compose down && RABBITMQ_IP=10.0.1.5 docker compose up -d'
```

Wait ~30 seconds, then check both containers are up:

```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
```

You should see `joke-mysql-1` and `joke-mongo-1` (or similar) with ports 3306 and 27017.

---

## 2. Get the Submit VM public IP

The Joke VM has **no public IP**. You reach it by tunnelling through the **Submit VM**, which has a public IP.

From your Mac:

```bash
# If you use Terraform
cd terraform && terraform output submit_public_ip

# Or Azure CLI
az vm list-ip-addresses -g jokes-rg -n jokes-submit-vm --query "[0].virtualMachine.network.publicIpAddresses[0].ipAddress" -o tsv
```

Use this IP as `<SUBMIT_VM_IP>` below. You also need the **Joke VM private IP** (usually **10.1.1.4**); same as in Kong config.

---

## 3. SSH tunnel so your laptop can reach both DBs

On your **Mac**, in a terminal, run (replace `<SUBMIT_VM_IP>` and use your SSH key if needed):

```bash
ssh -L 3306:10.1.1.4:3306 -L 27017:10.1.1.4:27017 azureuser@<SUBMIT_VM_IP>
```

- Leave this session **open** while you use Workbench and Compass.
- If you only want one DB, you can use just one `-L` (e.g. `-L 3306:10.1.1.4:3306` for MySQL only).

If the Submit VM cannot reach 10.1.1.4 (different VNets), ensure VNet peering is in place (Terraform usually does this). You can test from the Submit VM: `ssh azureuser@10.1.1.4` or `nc -zv 10.1.1.4 3306` (if SSH or netcat is available).

---

## 4. MySQL Workbench – connect and show MySQL being updated

1. **Connect**
   - Host: `127.0.0.1`
   - Port: `3306`
   - Username: `jokeuser`
   - Password: `jokepass`
   - Default schema: `jokedb`

2. **Show tables**
   - Open `jokedb` → Tables → `jokes` (and any others).
   - Run: `SELECT * FROM jokes ORDER BY id DESC LIMIT 10;`

3. **Demonstrate “database being updated”**
   - Use the app: open the **Submit** UI, submit a new joke, then go to **Moderate**, approve it.
   - In Workbench, run again: `SELECT * FROM jokes ORDER BY id DESC LIMIT 10;` (or refresh the table).
   - You should see the new row (ETL wrote it to MySQL).

---

## 5. MongoDB Compass – connect and show MongoDB being updated

1. **Connect**
   - URI: `mongodb://127.0.0.1:27017/jokedb`
   - (No auth by default in this setup.)

2. **Browse**
   - Database: `jokedb`
   - Collection: `jokes` (or whatever the app uses for Mongo).

3. **Demonstrate “database being updated” with MongoDB**
   - By default the **joke/ETL services use MySQL**. To show **MongoDB** being updated you have two options:

   **Option A – Switch joke/ETL to MongoDB temporarily**
   - On the Joke VM, set env and restart so joke and ETL use Mongo:
     ```bash
     az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript --scripts 'cd /home/azureuser/app/deploy/joke && RABBITMQ_IP=10.0.1.5 DB_TYPE=mongo MONGO_URI=mongodb://mongo:27017/jokedb docker compose up -d joke etl'
     ```
   - Use the app again (submit → moderate). ETL will write to MongoDB.
   - In Compass, refresh the `jokedb.jokes` collection and show the new document.

   **Option B – Keep MySQL as primary**
   - Show MySQL being updated in Workbench (as in section 4).
   - In Compass, show the **structure** of `jokedb` and explain that the same app can be configured to use MongoDB (`DB_TYPE=mongo`), and show one quick run with Option A so the examiner sees Mongo being updated.

---

## 6. Summary for the brief

- **MySQL**: Connect Workbench to `127.0.0.1:3306` (via the SSH tunnel), use the app (submit + moderate), then show new rows in the `jokes` table.
- **MongoDB**: Both DBs run on Azure; connect Compass to `127.0.0.1:27017/jokedb` (via the same tunnel). To show Mongo “being updated”, switch joke/ETL to `DB_TYPE=mongo` once, use the app, then show new documents in Compass; optionally switch back to MySQL afterward.

This satisfies “both databases being updated” and “using Workbench or similar and MongoDB [Compass]”.
