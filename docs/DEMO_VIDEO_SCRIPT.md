# Demo Video Script – Option 4 Distributed Architecture (Azure)

Read this while showing the code and the running system. Each section is designed to be recorded separately.

---

## Section 1 – System Overview and Azure Deployment

**Goal:** Show how the distributed architecture is deployed on Azure and how the five VMs and networking are defined in Terraform.

---

### 1.1 – Show Azure VMs (Azure Portal or CLI)

**Screen to show:**  
Either Azure Portal (Resource group → Virtual machines) or your terminal with Azure CLI output.

**Command to run (if using CLI):**
```bash
az vm list -g jokes-rg -d -o table --query "[].{Name:name, 'Public IP':publicIps, 'Private IP':privateIps, Location:location}"
```

If private IPs don’t show in that query, run:
```bash
az vm list -g jokes-rg --query "[].name" -o tsv
terraform -chdir=terraform output private_ips
```

**What to say:**  
“The system runs on five Azure virtual machines in the resource group jokes-rg. Here they are: jokes-kong-vm, jokes-rabbitmq-vm, jokes-joke-vm, jokes-moderate-vm, and jokes-submit-vm. Only two have public IPs: Kong, which is the single entry point for users, and Submit, which we use for SSH and for the GitHub Actions runner. The other three are private and only reachable over the virtual networks.”

---

### 1.2 – Terraform: where the VMs and resource group come from

**Screen to show:**  
Your editor with the Terraform project open.

**File to open:**  
`terraform/main.tf`

**Snippet to highlight (lines 1–4 and the resource group):**
```hcl
# Phase 6: 5 VMs across 3 regions, 3 VNets, global peering.
# Southeast Asia: Kong + RabbitMQ (4 vCPUs)
# Central India: Joke+ETL+DB (2 vCPUs)
# East Asia: Moderate + Submit (4 vCPUs)
...
resource "azurerm_resource_group" "rg" {
  name     = "${var.prefix}-rg"
  location = var.region_gateway
}
```

**What to say:**  
“Infrastructure is defined in Terraform. In main.tf we have one resource group—in our case jokes-rg—and five VMs spread across three regions: Southeast Asia for Kong and RabbitMQ, Central India for the Joke VM, and East Asia for Moderate and Submit. The prefix variable defaults to ‘jokes’, so all names start with jokes-.”

---

### 1.3 – The five VMs and their roles

**File to open:**  
`terraform/main.tf`

**Snippet to highlight (VM resources – use one block as example, e.g. Kong around 342–364):**
```hcl
resource "azurerm_linux_virtual_machine" "kong" {
  name                  = "${var.prefix}-kong-vm"
  resource_group_name   = azurerm_resource_group.rg.name
  location              = var.region_gateway
  size                  = local.vm_common.size
  admin_username        = local.vm_common.admin_username
  network_interface_ids = [azurerm_network_interface.kong_nic.id]
  ...
}
```

**What to say:**  
“Each VM is a separate azurerm_linux_virtual_machine. Kong VM runs the API gateway—and in our deployment, Nginx in front for TLS. RabbitMQ VM runs only the RabbitMQ container. Joke VM runs MySQL, MongoDB, the joke service, and the ETL service. Moderate VM runs the moderation microservice, and Submit VM runs the submit microservice plus the GitHub Actions self-hosted runner. So we have five VMs, each with a clear role in the pipeline.”

---

### 1.4 – Private IPs and NICs

**File to open:**  
`terraform/main.tf`

**Snippet to highlight (NIC definitions with static private IPs, e.g. Kong and Joke):**
```hcl
# Kong: 10.0.1.4 + public IP
resource "azurerm_network_interface" "kong_nic" {
  ...
  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet_gateway.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.4"
    public_ip_address_id          = azurerm_public_ip.kong_pip.id
  }
}
...
# Joke: 10.1.1.4
resource "azurerm_network_interface" "joke_nic" {
  ...
  ip_configuration {
    ...
    private_ip_address            = "10.1.1.4"
  }
}
```

**What to say:**  
“Each VM has a network interface with a static private IP. Kong is 10.0.1.4 and has the public IP attached. RabbitMQ is 10.0.1.5 in the same subnet. Joke is 10.1.1.4 in the second VNet, and Moderate and Submit are 10.2.1.4 and 10.2.1.5 in the third. These private IPs are what we use in Kong’s config and in the app environment variables so services talk to each other by IP, not by hostname.”

---

### 1.5 – Three VNets and peering

**File to open:**  
`terraform/main.tf`

**Snippet to highlight (VNet definitions and one peering pair):**
```hcl
# --- VNet 1: Gateway region (Southeast Asia) 10.0.0.0/16
resource "azurerm_virtual_network" "vnet_gateway" {
  name                = "${var.prefix}-vnet-gateway"
  address_space       = ["10.0.0.0/16"]
  ...
}
# --- VNet 2: Joke region (Central India) 10.1.0.0/16
resource "azurerm_virtual_network" "vnet_joke" {
  address_space       = ["10.1.0.0/16"]
  ...
}
# --- VNet 3: Apps region (East Asia) 10.2.0.0/16
resource "azurerm_virtual_network" "vnet_apps" {
  address_space       = ["10.2.0.0/16"]
  ...
}
# --- VNet peering (bidirectional: 1-2, 1-3, 2-3)
resource "azurerm_virtual_network_peering" "gateway_to_joke" {
  ...
  allow_virtual_network_access = true
}
resource "azurerm_virtual_network_peering" "joke_to_gateway" {
  ...
}
```

**What to say:**  
“We use three virtual networks: one for the gateway region at 10.0.0.0/16, one for the Joke region at 10.1.0.0/16, and one for the apps region at 10.2.0.0/16. There are six peering relationships—two per pair—so gateway can reach joke and apps, joke can reach gateway and apps, and apps can reach both. That’s how Kong on 10.0.1.4 can call the Joke service on 10.1.1.4 and the Moderate and Submit services on 10.2.1.4 and 10.2.1.5. All service-to-service traffic uses these private IPs over Azure’s backbone.”

---

### 1.6 – Private IPs output (used by Kong and apps)

**File to open:**  
`terraform/outputs.tf`

**Snippet to highlight:**
```hcl
output "private_ips" {
  value = {
    kong     = azurerm_network_interface.kong_nic.private_ip_address
    rabbitmq = azurerm_network_interface.rabbitmq_nic.private_ip_address
    joke     = azurerm_network_interface.joke_nic.private_ip_address
    moderate = azurerm_network_interface.moderate_nic.private_ip_address
    submit   = azurerm_network_interface.submit_nic.private_ip_address
  }
  description = "Use these in Kong config and app env (replace 172.28.0.x with these IPs for Azure)"
}
```

**Command to run (optional):**
```bash
terraform -chdir=terraform output private_ips
```

**What to say:**  
“The Terraform output private_ips exposes these five addresses. Our Kong config and the deploy scripts use these so Kong forwards to 10.1.1.4 for the joke service, 10.2.1.4 for moderate, and 10.2.1.5 for submit. The Submit and Moderate services get JOKE_IP and RABBITMQ_IP set to 10.1.1.4 and 10.0.1.5 so they can call the joke API and the message broker. So the whole distributed system discovers backends by these static private IPs defined in Terraform.”

---

### 1.7 – Short recap

**Screen to show:**  
Either the Azure Portal VM list or the terminal with the last command output.

**What to say:**  
“So to recap: we have five VMs in jokes-rg—Kong, RabbitMQ, Joke, Moderate, and Submit—across three regions and three VNets, with bidirectional peering. Only Kong and Submit have public IPs. All service communication uses the private IPs we just saw, and that’s how the distributed architecture is deployed on Azure.”

---

**End of Section 1.**  
When you’re ready, ask for **Section 2** and the script will continue from there.
