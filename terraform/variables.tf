# Required: set in terraform.tfvars (do not commit).
variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

# Repo to clone on Joke/Moderate/Submit VMs for deploy. Empty = only Kong + RabbitMQ get compose.
variable "repo_url" {
  description = "Git repo URL for app deploy (clone on app VMs)"
  type        = string
  default     = ""
}

variable "prefix" {
  description = "Prefix for resource names (e.g. jokes-rg, jokes-kong-vm)"
  type        = string
  default     = "jokes"
}

variable "admin_username" {
  description = "Admin username for VMs (SSH login)"
  type        = string
  default     = "azureuser"
}

variable "admin_ssh_public_key_path" {
  description = "Path to SSH public key for VM admin (e.g. ~/.ssh/id_rsa.pub)"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "vm_size" {
  description = "Azure VM size (e.g. Standard_B2ats_v2 for student subscription)"
  type        = string
  default     = "Standard_B2ats_v2"
}

variable "region_gateway" {
  description = "Region for Kong + RabbitMQ"
  type        = string
  default     = "southeastasia"
}

variable "region_joke" {
  description = "Region for Joke + ETL + MySQL"
  type        = string
  default     = "centralindia"
}

variable "region_apps" {
  description = "Region for Moderate + Submit"
  type        = string
  default     = "eastasia"
}

# Let's Encrypt (CA-signed cert): Azure gives you <label>.<region>.cloudapp.azure.com
variable "kong_domain_name_label" {
  description = "Domain name label for Kong public IP (FQDN: <label>.<region_gateway>.cloudapp.azure.com). Set for Let's Encrypt."
  type        = string
  default     = ""
}

variable "certbot_email" {
  description = "Email for Let's Encrypt (required if kong_domain_name_label is set)"
  type        = string
  default     = ""
}
