// ============================================================================
// identity.bicep — the single user-assigned managed identity for the Django API.
//
// Scope: resource group. This identity is what the Django Container App uses to
// pull its image from ACR (AcrPull, granted in container-registry.bicep).
//
// Exactly one identity is created. Identities for the market-data service, the
// risk-engine service, the Celery worker, Celery Beat, the Static Web App, and
// deployment automation are deferred to Phase 41 / Phase 43. A user-assigned
// managed identity has no client secret, so none is created.
// ============================================================================

@description('Azure region for the managed identity.')
param location string

@description('Tags applied to the managed identity.')
param tags object

@description('Name of the user-assigned managed identity for the Django API.')
param managedIdentityName string

resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: managedIdentityName
  location: location
  tags: tags
}

@description('Resource ID of the API user-assigned managed identity.')
output identityId string = apiIdentity.id

@description('Client (application) ID of the API user-assigned managed identity.')
output clientId string = apiIdentity.properties.clientId

@description('Principal (object) ID of the API user-assigned managed identity.')
output principalId string = apiIdentity.properties.principalId
