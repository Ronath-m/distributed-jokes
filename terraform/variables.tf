# Phase 6: multi-region (student subscription 4 vCPUs per region).
# 5 VMs across 3 regions; Standard_B2ats_v2 (2 vCPUs each).

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = "jokes"
}

variable "admin_username" {
  description = "VM admin username"
  type        = string
  default     = "azureuser"
}

variable "admin_ssh_public_key_path" {
  description = "Path to your SSH public key for VM login"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "vm_size" {
  description = "VM size (2 vCPUs to stay within 4 vCPUs per region with 2 VMs)"
  type        = string
  default     = "Standard_B2ats_v2"
}

# 3 regions: Southeast Asia (Kong + RabbitMQ), Central India (Joke), East Asia (Moderate + Submit)
variable "region_gateway" {
  description = "Region for Kong and RabbitMQ VMs"
  type        = string
  default     = "southeastasia"
}

variable "region_joke" {
  description = "Region for Joke+ETL+DB VM"
  type        = string
  default     = "centralindia"
}

variable "region_apps" {
  description = "Region for Moderate and Submit VMs"
  type        = string
  default     = "eastasia"
}

# Optional: if set, Terraform will clone this repo on Joke/Moderate/Submit VMs and run docker compose up -d --build
variable "repo_url" {
  description = "Git repo URL to clone on app VMs for deploy (e.g. https://github.com/user/distributed-jokes.git). Leave empty to deploy manually."
  type        = string
  default     = ""
}
