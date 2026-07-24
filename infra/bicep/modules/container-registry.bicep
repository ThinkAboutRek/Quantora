// ============================================================================
// container-registry.bicep — Azure Container Registry (Basic) plus a single
// registry-scoped AcrPull grant to the API managed identity.
//
// Scope: resource group.
//
// The API version is pinned to 2025-11-01 specifically: it is the first STABLE
// version that exposes `roleAssignmentMode`. The value 'LegacyRegistryPermissions'
// keeps the registry on classic registry-level RBAC, under which the built-in
// AcrPull role IS honoured. If a future phase moves the registry to
// 'AbacRepositoryPermissions' (repository-level ABAC), the AcrPull grant below
// stops working and must be replaced with an appropriate repository-reader role.
//
// Deliberately NOT configured: retention/purge tasks, content trust, image
// signing, private endpoints, network allow-lists, credential sets, webhooks.
// No image is pushed and no repository is created.
// ============================================================================

@description('Azure region for the container registry.')
param location string

@description('Tags applied to the container registry.')
param tags object

@description('Globally unique container registry name (alphanumeric only).')
param containerRegistryName string

@description('Principal ID of the user-assigned identity that is granted AcrPull on this registry.')
param apiIdentityPrincipalId string

// Built-in AcrPull role definition (well-known GUID), resolved to a full role
// definition resource ID at the subscription scope.
var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: containerRegistryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
    roleAssignmentMode: 'LegacyRegistryPermissions'
  }
}

// AcrPull, scoped to THIS registry only — never the resource group or
// subscription. The name is deterministic so redeployment is idempotent.
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, apiIdentityPrincipalId, acrPullRoleDefinitionId)
  scope: containerRegistry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: apiIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

@description('Name of the container registry.')
output containerRegistryName string = containerRegistry.name

@description('Resource ID of the container registry.')
output containerRegistryId string = containerRegistry.id

@description('Login server (FQDN) of the container registry.')
output loginServer string = containerRegistry.properties.loginServer
