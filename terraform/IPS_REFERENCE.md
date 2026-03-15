# How to get Azure IPs (run from `terraform/`)

Values come from Terraform state. Run these **from the terraform directory** after `terraform apply`:

```bash
cd terraform

# Kong public IP – use in browser: http://<this-ip>, http://<this-ip>:8080 (Keycloak)
terraform output kong_public_ip

# Submit VM public IP – for SSH (e.g. runner setup)
terraform output submit_public_ip

# All private IPs (for Kong config / app env; not for browser)
terraform output private_ips

# Resource group name
terraform output resource_group
```

**Quick copy (Kong only):**
```bash
cd terraform && terraform output -raw kong_public_ip
```
Use that value as `<KONG_IP>` in Keycloak redirect URIs and in the browser.
