# Self-hosted GitHub Actions runner (submit VM)

The CD workflow runs on a **self-hosted runner** on the submit VM and uses the VM’s **Managed Identity** to run `az vm run-command` on the other VMs. No Azure app registration or `AZURE_CREDENTIALS` is required.

Do this **once** after Terraform has applied (submit VM has managed identity + Contributor on the resource group).

## 1. SSH into the submit VM

Use Azure Bastion, or a jump host that can reach the submit VM’s private IP. Example with SSH key and Bastion:

- In Azure Portal: open **jokes-submit-vm** → **Connect** → **Bastion** (if enabled), or use your usual SSH path.

Example (if you have a public IP or Bastion host):

```bash
ssh azureuser@<submit-vm-ip-or-bastion>
```

## 2. Install Azure CLI (for `az login --identity`)

On the VM:

```bash
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

Verify managed identity (after Terraform has applied the role assignment):

```bash
az login --identity
az account set --subscription "<your-subscription-id>"
az vm list -g jokes-rg -o table
```

If that works, the runner will be able to run Azure CLI without any stored credentials.

## 3. Install the GitHub Actions runner

On the submit VM:

1. Create a folder and download the runner (replace `X.Y.Z` with the [latest version](https://github.com/actions/runner/releases) if you prefer):

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
   tar xzf actions-runner-linux-x64-2.311.0.tar.gz
   ```

2. In GitHub: **Repo → Settings → Actions → Runners → New self-hosted runner**. Copy the **Configure** commands (they look like):

   ```bash
   ./config.sh --url https://github.com/YOUR_ORG/distributed-jokes --token RUNNER_TOKEN
   ```

3. Run the config with **labels** so the workflow can select this runner. Use label `azure` (the workflow uses `runs-on: [ self-hosted, azure ]`):

   ```bash
   ./config.sh --url https://github.com/YOUR_ORG/distributed-jokes --token RUNNER_TOKEN --labels azure
   ```

4. Install and start the runner as a service (so it survives logout):

   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

5. Check status:

   ```bash
   sudo ./svc.sh status
   ```

The runner should appear under **Settings → Actions → Runners** with label `azure`.

## 4. Optional: GitHub secret

If you have more than one Azure subscription, add repo secret **AZURE_SUBSCRIPTION_ID** (your subscription ID) so the workflow runs in the correct subscription. With a single subscription, the step is optional.

## Summary

- **Terraform:** Submit VM has `identity { type = "SystemAssigned" }` and a role assignment **Contributor** on the resource group.
- **Runner:** Installed on the submit VM with label `azure`, running as a service.
- **Workflow:** `runs-on: [ self-hosted, azure ]`, then `az login --identity` and `az vm run-command` — no app registration or client secrets.
