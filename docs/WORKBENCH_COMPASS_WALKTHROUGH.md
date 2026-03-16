# Step-by-step: Show both databases (Workbench & Compass)

Follow these in order. You need: MySQL Workbench and MongoDB Compass installed, Azure CLI logged in, and SSH access to the Submit VM.

---

## Step 1 – Get the Submit VM public IP

On your **Mac**, in a terminal:

```bash
az vm list-ip-addresses -g jokes-rg -n jokes-submit-vm --query "[0].virtualMachine.network.publicIpAddresses[0].ipAddress" -o tsv
```

Write down the IP (e.g. `52.123.45.67`). You’ll use it as **SUBMIT_IP** in Step 3.

---

## Step 2 – Check both DBs are running on the Joke VM

```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
```

You should see **joke-mysql-1** and **joke-mongo-1** (or similar) with **Up** and ports **3306** and **27017**.

If **joke-mongo-1** is missing or Exited, redeploy the Joke stack:

```bash
az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
  --scripts 'cd /home/azureuser/app/deploy/joke && git pull && RABBITMQ_IP=10.0.1.5 docker compose down && RABBITMQ_IP=10.0.1.5 docker compose up -d'
```

Wait ~30 seconds, then run the `docker ps` check again.

---

## Step 3 – Open the SSH tunnel (keep this terminal open)

On your **Mac**, in a **new terminal** (you’ll leave this running):

```bash
ssh -L 3306:10.1.1.4:3306 -L 27017:10.1.1.4:27017 azureuser@SUBMIT_IP
```

Replace **SUBMIT_IP** with the IP from Step 1. Use `-i path/to/your/key` if you need a specific SSH key.

- You’ll be logged into the Submit VM. That’s fine.
- **Do not close this terminal** while you use Workbench and Compass. As long as this SSH session is open, `localhost:3306` and `localhost:27017` on your Mac will forward to MySQL and MongoDB on the Joke VM.

If you get “port already in use” (e.g. you already have local MySQL), use different local ports:

```bash
ssh -L 3307:10.1.1.4:3306 -L 27018:10.1.1.4:27017 azureuser@SUBMIT_IP
```

Then in Workbench use port **3307**, and in Compass use **mongodb://127.0.0.1:27018/jokedb**.

---

## Step 4 – MySQL Workbench: connect and see MySQL

1. Open **MySQL Workbench**.
2. Add a new connection (or use an existing one and edit):
   - **Connection name:** e.g. `Azure Joke (tunnel)`
   - **Hostname:** `127.0.0.1`
   - **Port:** `3306` (or `3307` if you used the alternate tunnel)
   - **Username:** `jokeuser`
   - **Password:** click “Store in Keychain…” and enter `jokepass`
   - **Default Schema:** `jokedb`
3. Click **Test Connection**; it should succeed. Then **OK** and **connect** to the connection.
4. In the left panel, open **Schemas** → **jokedb** → **Tables** → **jokes**. Right‑click **jokes** → **Select Rows**. You should see existing rows (or an empty result if the table is new).

---

## Step 5 – Show MySQL being updated

1. Open your app in the browser:  
   `https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443/app/submit`  
   Submit a **new joke** (any type, any text).
2. Go to **Moderate**:  
   `https://jokes-kong-ron.southeastasia.cloudapp.azure.com:8443/app/moderate`  
   Log in if needed, then **approve** the joke you just submitted.
3. Back in **MySQL Workbench**, right‑click the **jokes** table → **Select Rows** again (or run `SELECT * FROM jokes ORDER BY id DESC LIMIT 10;`).  
   You should see the **new row** that the ETL wrote to MySQL.  
   That’s “MySQL being updated” for the brief.

---

## Step 6 – MongoDB Compass: connect and see Mongo

1. Open **MongoDB Compass**.
2. In “New Connection”, paste:  
   `mongodb://127.0.0.1:27017`  
   (If you used the alternate tunnel, use `mongodb://127.0.0.1:27018`.)
3. Click **Connect**.
4. In the left sidebar, open database **jokedb**. If there is a **jokes** collection, open it. You might see documents (if the app was ever run with MongoDB) or it might be empty. That’s fine for the next step.

---

## Step 7 – Show MongoDB being updated

By default the app uses **MySQL**. To show **MongoDB** being updated, switch the Joke VM to use Mongo once, then use the app again.

1. On your **Mac**, in a terminal **other than** the one running the SSH tunnel, run:

   ```bash
   az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
     --scripts 'cd /home/azureuser/app/deploy/joke && RABBITMQ_IP=10.0.1.5 DB_TYPE=mongo MONGO_URI=mongodb://mongo:27017/jokedb docker compose up -d joke etl'
   ```

2. Wait ~15 seconds. Then in the browser:
   - **Submit** another new joke.
   - Go to **Moderate** and **approve** it.
3. In **MongoDB Compass**, go to **jokedb** → **jokes** and click **Refresh** (or reopen the collection).  
   You should see a **new document** that the ETL wrote to MongoDB.  
   That’s “MongoDB being updated” for the brief.

4. (Optional) Switch the app back to MySQL so everything keeps working as before:

   ```bash
   az vm run-command invoke -g jokes-rg -n jokes-joke-vm --command-id RunShellScript \
     --scripts 'cd /home/azureuser/app/deploy/joke && RABBITMQ_IP=10.0.1.5 docker compose up -d joke etl'
   ```

---

## Quick reference

| Tool            | Connect to              | Credentials / URI |
|-----------------|-------------------------|--------------------|
| MySQL Workbench | `127.0.0.1:3306`        | User: `jokeuser`, Password: `jokepass`, Schema: `jokedb` |
| MongoDB Compass | `mongodb://127.0.0.1:27017/jokedb` | No auth in this setup |

The SSH tunnel must be running (Step 3) for both to work. Joke VM private IP is **10.1.1.4** (used in the tunnel).
