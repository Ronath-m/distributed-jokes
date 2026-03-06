output "resource_group" {
  value = azurerm_resource_group.rg.name
}

output "kong_public_ip" {
  value       = azurerm_public_ip.kong_pip.ip_address
  description = "Use this URL for the API gateway (e.g. http://<this-ip>)"
}

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

output "regions" {
  value = {
    gateway = var.region_gateway
    joke    = var.region_joke
    apps    = var.region_apps
  }
}
