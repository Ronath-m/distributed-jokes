# Phase 6: 5 VMs across 3 regions, 3 VNets, global peering.
# Southeast Asia: Kong + RabbitMQ (4 vCPUs)
# Central India: Joke+ETL+DB (2 vCPUs)
# East Asia: Moderate + Submit (4 vCPUs)

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

# Single RG (location is primary region; resources can be in any region)
resource "azurerm_resource_group" "rg" {
  name     = "${var.prefix}-rg"
  location = var.region_gateway
}

# --- VNet 1: Gateway region (Southeast Asia) 10.0.0.0/16
resource "azurerm_virtual_network" "vnet_gateway" {
  name                = "${var.prefix}-vnet-gateway"
  address_space       = ["10.0.0.0/16"]
  location            = var.region_gateway
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_subnet" "subnet_gateway" {
  name                 = "${var.prefix}-subnet-gateway"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet_gateway.name
  address_prefixes     = ["10.0.1.0/24"]
}

# Allow HTTP (80) and SSH (22) to Kong VM so the site is reachable
resource "azurerm_network_security_group" "gateway" {
  name                = "${var.prefix}-gateway-nsg"
  location            = var.region_gateway
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_network_security_rule" "allow_http" {
  name                        = "allow-http"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range     = "80"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.rg.name
  network_security_group_name = azurerm_network_security_group.gateway.name
}

resource "azurerm_network_security_rule" "allow_ssh" {
  name                        = "allow-ssh"
  priority                    = 110
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range     = "22"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.rg.name
  network_security_group_name = azurerm_network_security_group.gateway.name
}

resource "azurerm_subnet_network_security_group_association" "gateway" {
  subnet_id                 = azurerm_subnet.subnet_gateway.id
  network_security_group_id = azurerm_network_security_group.gateway.id
}

# --- VNet 2: Joke region (Central India) 10.1.0.0/16
resource "azurerm_virtual_network" "vnet_joke" {
  name                = "${var.prefix}-vnet-joke"
  address_space       = ["10.1.0.0/16"]
  location            = var.region_joke
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_subnet" "subnet_joke" {
  name                 = "${var.prefix}-subnet-joke"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet_joke.name
  address_prefixes     = ["10.1.1.0/24"]
}

# --- VNet 3: Apps region (East Asia) 10.2.0.0/16
resource "azurerm_virtual_network" "vnet_apps" {
  name                = "${var.prefix}-vnet-apps"
  address_space       = ["10.2.0.0/16"]
  location            = var.region_apps
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_subnet" "subnet_apps" {
  name                 = "${var.prefix}-subnet-apps"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet_apps.name
  address_prefixes     = ["10.2.1.0/24"]
}

# --- VNet peering (bidirectional: 1-2, 1-3, 2-3)
resource "azurerm_virtual_network_peering" "gateway_to_joke" {
  name                         = "${var.prefix}-peer-gw-to-joke"
  resource_group_name          = azurerm_resource_group.rg.name
  virtual_network_name         = azurerm_virtual_network.vnet_gateway.name
  remote_virtual_network_id   = azurerm_virtual_network.vnet_joke.id
  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
}

resource "azurerm_virtual_network_peering" "joke_to_gateway" {
  name                         = "${var.prefix}-peer-joke-to-gw"
  resource_group_name          = azurerm_resource_group.rg.name
  virtual_network_name         = azurerm_virtual_network.vnet_joke.name
  remote_virtual_network_id   = azurerm_virtual_network.vnet_gateway.id
  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
}

resource "azurerm_virtual_network_peering" "gateway_to_apps" {
  name                         = "${var.prefix}-peer-gw-to-apps"
  resource_group_name          = azurerm_resource_group.rg.name
  virtual_network_name         = azurerm_virtual_network.vnet_gateway.name
  remote_virtual_network_id   = azurerm_virtual_network.vnet_apps.id
  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
}

resource "azurerm_virtual_network_peering" "apps_to_gateway" {
  name                         = "${var.prefix}-peer-apps-to-gw"
  resource_group_name          = azurerm_resource_group.rg.name
  virtual_network_name         = azurerm_virtual_network.vnet_apps.name
  remote_virtual_network_id   = azurerm_virtual_network.vnet_gateway.id
  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
}

resource "azurerm_virtual_network_peering" "joke_to_apps" {
  name                         = "${var.prefix}-peer-joke-to-apps"
  resource_group_name          = azurerm_resource_group.rg.name
  virtual_network_name         = azurerm_virtual_network.vnet_joke.name
  remote_virtual_network_id   = azurerm_virtual_network.vnet_apps.id
  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
}

resource "azurerm_virtual_network_peering" "apps_to_joke" {
  name                         = "${var.prefix}-peer-apps-to-joke"
  resource_group_name          = azurerm_resource_group.rg.name
  virtual_network_name         = azurerm_virtual_network.vnet_apps.name
  remote_virtual_network_id   = azurerm_virtual_network.vnet_joke.id
  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
}

# --- Public IP for Kong (single entry from internet)
resource "azurerm_public_ip" "kong_pip" {
  name                = "${var.prefix}-kong-pip"
  location            = var.region_gateway
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

# --- Public IP for submit VM (so you can SSH from your Mac for runner setup)
resource "azurerm_public_ip" "submit_pip" {
  name                = "${var.prefix}-submit-pip"
  location            = var.region_apps
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

# --- NSG for submit VM: allow SSH so you can connect from your Mac
resource "azurerm_network_security_group" "submit" {
  name                = "${var.prefix}-submit-nsg"
  location            = var.region_apps
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_network_security_rule" "submit_allow_ssh" {
  name                        = "allow-ssh"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "22"
  source_address_prefix       = "0.0.0.0/0"
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.rg.name
  network_security_group_name = azurerm_network_security_group.submit.name
}

# --- NICs and VMs
# Kong: 10.0.1.4 + public IP
resource "azurerm_network_interface" "kong_nic" {
  name                = "${var.prefix}-kong-nic"
  location            = var.region_gateway
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet_gateway.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.4"
    public_ip_address_id          = azurerm_public_ip.kong_pip.id
  }
}

# RabbitMQ: 10.0.1.5
resource "azurerm_network_interface" "rabbitmq_nic" {
  name                = "${var.prefix}-rabbitmq-nic"
  location            = var.region_gateway
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet_gateway.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.5"
  }
}

# Joke: 10.1.1.4
resource "azurerm_network_interface" "joke_nic" {
  name                = "${var.prefix}-joke-nic"
  location            = var.region_joke
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet_joke.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.1.1.4"
  }
}

# Moderate: 10.2.1.4
resource "azurerm_network_interface" "moderate_nic" {
  name                = "${var.prefix}-moderate-nic"
  location            = var.region_apps
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet_apps.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.2.1.4"
  }
}

# Submit: 10.2.1.5 + public IP (for SSH from your Mac to install runner)
resource "azurerm_network_interface" "submit_nic" {
  name                = "${var.prefix}-submit-nic"
  location            = var.region_apps
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet_apps.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.2.1.5"
    public_ip_address_id          = azurerm_public_ip.submit_pip.id
  }
}

resource "azurerm_network_interface_security_group_association" "submit" {
  network_interface_id      = azurerm_network_interface.submit_nic.id
  network_security_group_id = azurerm_network_security_group.submit.id
}

# VM common settings
locals {
  vm_common = {
    size           = var.vm_size
    admin_username = var.admin_username
    admin_ssh_key = {
      username   = var.admin_username
      public_key = file(pathexpand(var.admin_ssh_public_key_path))
    }
    os_disk = {
      caching              = "ReadWrite"
      storage_account_type = "Standard_LRS"
    }
    source_image_reference = {
      publisher = "Canonical"
      offer     = "0001-com-ubuntu-server-jammy"
      sku       = "22_04-lts"
      version   = "latest"
    }
  }
}

resource "azurerm_linux_virtual_machine" "kong" {
  name                  = "${var.prefix}-kong-vm"
  resource_group_name   = azurerm_resource_group.rg.name
  location              = var.region_gateway
  size                  = local.vm_common.size
  admin_username        = local.vm_common.admin_username
  network_interface_ids = [azurerm_network_interface.kong_nic.id]

  admin_ssh_key {
    username   = local.vm_common.admin_username
    public_key = local.vm_common.admin_ssh_key.public_key
  }
  os_disk {
    caching              = local.vm_common.os_disk.caching
    storage_account_type = local.vm_common.os_disk.storage_account_type
  }
  source_image_reference {
    publisher = local.vm_common.source_image_reference.publisher
    offer     = local.vm_common.source_image_reference.offer
    sku       = local.vm_common.source_image_reference.sku
    version   = local.vm_common.source_image_reference.version
  }
}

resource "azurerm_linux_virtual_machine" "rabbitmq" {
  name                  = "${var.prefix}-rabbitmq-vm"
  resource_group_name   = azurerm_resource_group.rg.name
  location              = var.region_gateway
  size                  = local.vm_common.size
  admin_username        = local.vm_common.admin_username
  network_interface_ids = [azurerm_network_interface.rabbitmq_nic.id]

  admin_ssh_key {
    username   = local.vm_common.admin_username
    public_key = local.vm_common.admin_ssh_key.public_key
  }
  os_disk {
    caching              = local.vm_common.os_disk.caching
    storage_account_type = local.vm_common.os_disk.storage_account_type
  }
  source_image_reference {
    publisher = local.vm_common.source_image_reference.publisher
    offer     = local.vm_common.source_image_reference.offer
    sku       = local.vm_common.source_image_reference.sku
    version   = local.vm_common.source_image_reference.version
  }
}

resource "azurerm_linux_virtual_machine" "joke" {
  name                  = "${var.prefix}-joke-vm"
  resource_group_name   = azurerm_resource_group.rg.name
  location              = var.region_joke
  size                  = local.vm_common.size
  admin_username        = local.vm_common.admin_username
  network_interface_ids = [azurerm_network_interface.joke_nic.id]

  admin_ssh_key {
    username   = local.vm_common.admin_username
    public_key = local.vm_common.admin_ssh_key.public_key
  }
  os_disk {
    caching              = local.vm_common.os_disk.caching
    storage_account_type = local.vm_common.os_disk.storage_account_type
  }
  source_image_reference {
    publisher = local.vm_common.source_image_reference.publisher
    offer     = local.vm_common.source_image_reference.offer
    sku       = local.vm_common.source_image_reference.sku
    version   = local.vm_common.source_image_reference.version
  }
}

resource "azurerm_linux_virtual_machine" "moderate" {
  name                  = "${var.prefix}-moderate-vm"
  resource_group_name   = azurerm_resource_group.rg.name
  location              = var.region_apps
  size                  = local.vm_common.size
  admin_username        = local.vm_common.admin_username
  network_interface_ids = [azurerm_network_interface.moderate_nic.id]

  admin_ssh_key {
    username   = local.vm_common.admin_username
    public_key = local.vm_common.admin_ssh_key.public_key
  }
  os_disk {
    caching              = local.vm_common.os_disk.caching
    storage_account_type = local.vm_common.os_disk.storage_account_type
  }
  source_image_reference {
    publisher = local.vm_common.source_image_reference.publisher
    offer     = local.vm_common.source_image_reference.offer
    sku       = local.vm_common.source_image_reference.sku
    version   = local.vm_common.source_image_reference.version
  }
}

resource "azurerm_linux_virtual_machine" "submit" {
  name                  = "${var.prefix}-submit-vm"
  resource_group_name   = azurerm_resource_group.rg.name
  location              = var.region_apps
  size                  = local.vm_common.size
  admin_username        = local.vm_common.admin_username
  network_interface_ids = [azurerm_network_interface.submit_nic.id]

  # NOTE: We enable the system-assigned managed identity and grant it Contributor on the
  # resource group with a one-time `az` CLI command (see README). Terraform does not
  # manage the role assignment to avoid provider bugs around principal_id resolution.
  identity {
    type = "SystemAssigned"
  }

  admin_ssh_key {
    username   = local.vm_common.admin_username
    public_key = local.vm_common.admin_ssh_key.public_key
  }
  os_disk {
    caching              = local.vm_common.os_disk.caching
    storage_account_type = local.vm_common.os_disk.storage_account_type
  }
  source_image_reference {
    publisher = local.vm_common.source_image_reference.publisher
    offer     = local.vm_common.source_image_reference.offer
    sku       = local.vm_common.source_image_reference.sku
    version   = local.vm_common.source_image_reference.version
  }
}

# --- One CustomScript per VM: install Docker + run Compose (Azure allows only one CustomScript per VM)
locals {
  deploy_dir           = "${path.module}/../deploy"
  docker_install      = "curl -fsSL https://get.docker.com | sh && usermod -aG docker ${var.admin_username}"
  kong_yml_b64        = base64encode(file("${path.module}/../gateway/kong-azure.example.yml"))
  kong_compose_b64    = base64encode(file("${path.module}/../deploy/kong/docker-compose.yml"))
  rabbitmq_compose_b64 = base64encode(file("${path.module}/../deploy/rabbitmq/docker-compose.yml"))
  rabbitmq_ip         = azurerm_network_interface.rabbitmq_nic.private_ip_address
  joke_ip             = azurerm_network_interface.joke_nic.private_ip_address
  joke_compose_b64     = base64encode(file("${path.module}/../deploy/joke/docker-compose.yml"))
  moderate_compose_b64 = base64encode(file("${path.module}/../deploy/moderate/docker-compose.yml"))
  submit_compose_b64   = base64encode(file("${path.module}/../deploy/submit/docker-compose.yml"))
  # Kong: install Docker then write kong.yml + compose and run
  kong_script = "${local.docker_install} && mkdir -p /home/azureuser/kong && echo '${local.kong_yml_b64}' | base64 -d > /home/azureuser/kong/kong.yml && echo '${local.kong_compose_b64}' | base64 -d > /home/azureuser/kong/docker-compose.yml && cd /home/azureuser/kong && docker compose up -d"
  # RabbitMQ: install Docker then write compose and run
  rabbitmq_script = "${local.docker_install} && mkdir -p /home/azureuser/rabbitmq && echo '${local.rabbitmq_compose_b64}' | base64 -d > /home/azureuser/rabbitmq/docker-compose.yml && cd /home/azureuser/rabbitmq && docker compose up -d"
  # Sync app repo: pull if already cloned, else clone (so taint+apply gets latest code)
  repo_sync       = "mkdir -p /home/azureuser/app && ( [ -d /home/azureuser/app/.git ] && ( cd /home/azureuser/app && git pull ) || git clone ${var.repo_url} /home/azureuser/app )"
  # Joke/Moderate/Submit: run docker compose in background so extension finishes before Azure timeout (~90 min)
  joke_script     = var.repo_url != "" ? "${local.docker_install} && ${local.repo_sync} && mkdir -p /home/azureuser/app/deploy/joke && echo '${local.joke_compose_b64}' | base64 -d > /home/azureuser/app/deploy/joke/docker-compose.yml && cd /home/azureuser/app/deploy/joke && nohup env RABBITMQ_IP=${local.rabbitmq_ip} docker compose up -d --build >> /var/log/joke-compose.log 2>&1 & sleep 3" : local.docker_install
  moderate_script = var.repo_url != "" ? "${local.docker_install} && ${local.repo_sync} && mkdir -p /home/azureuser/app/deploy/moderate && echo '${local.moderate_compose_b64}' | base64 -d > /home/azureuser/app/deploy/moderate/docker-compose.yml && cd /home/azureuser/app/deploy/moderate && nohup env JOKE_IP=${local.joke_ip} RABBITMQ_IP=${local.rabbitmq_ip} docker compose up -d --build >> /var/log/moderate-compose.log 2>&1 & sleep 3" : local.docker_install
  submit_script   = var.repo_url != "" ? "${local.docker_install} && ${local.repo_sync} && mkdir -p /home/azureuser/app/deploy/submit && echo '${local.submit_compose_b64}' | base64 -d > /home/azureuser/app/deploy/submit/docker-compose.yml && cd /home/azureuser/app/deploy/submit && nohup env JOKE_IP=${local.joke_ip} RABBITMQ_IP=${local.rabbitmq_ip} docker compose up -d --build >> /var/log/submit-compose.log 2>&1 & sleep 3" : local.docker_install
}

resource "azurerm_virtual_machine_extension" "docker_kong" {
  name                 = "install-docker"
  virtual_machine_id   = azurerm_linux_virtual_machine.kong.id
  publisher            = "Microsoft.Azure.Extensions"
  type                 = "CustomScript"
  type_handler_version = "2.1"
  settings = jsonencode({
    commandToExecute = local.kong_script
  })
}

resource "azurerm_virtual_machine_extension" "docker_rabbitmq" {
  name                 = "install-docker"
  virtual_machine_id   = azurerm_linux_virtual_machine.rabbitmq.id
  publisher            = "Microsoft.Azure.Extensions"
  type                 = "CustomScript"
  type_handler_version = "2.1"
  settings = jsonencode({
    commandToExecute = local.rabbitmq_script
  })
}

resource "azurerm_virtual_machine_extension" "docker_joke" {
  name                 = "install-docker"
  virtual_machine_id   = azurerm_linux_virtual_machine.joke.id
  publisher            = "Microsoft.Azure.Extensions"
  type                 = "CustomScript"
  type_handler_version = "2.1"
  settings = jsonencode({
    commandToExecute = local.joke_script
  })
}

resource "azurerm_virtual_machine_extension" "docker_moderate" {
  name                 = "install-docker"
  virtual_machine_id   = azurerm_linux_virtual_machine.moderate.id
  publisher            = "Microsoft.Azure.Extensions"
  type                 = "CustomScript"
  type_handler_version = "2.1"
  settings = jsonencode({
    commandToExecute = local.moderate_script
  })
}

resource "azurerm_virtual_machine_extension" "docker_submit" {
  name                 = "install-docker"
  virtual_machine_id   = azurerm_linux_virtual_machine.submit.id
  publisher            = "Microsoft.Azure.Extensions"
  type                 = "CustomScript"
  type_handler_version = "2.1"
  settings = jsonencode({
    commandToExecute = local.submit_script
  })
}
