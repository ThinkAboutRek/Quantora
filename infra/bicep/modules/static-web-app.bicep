// ============================================================================
// static-web-app.bicep — Azure Static Web App (Free) for the React bundle.
//
// Scope: resource group. Location is supplied by the caller because Static Web
// Apps are unavailable in UK South; the caller passes a supported region
// (West Europe for this environment).
//
// Deliberately NOT configured: repositoryUrl, branch, repositoryToken,
// buildProperties, custom domains, linked backends, and managed functions.
// Source wiring and deployment are Phase 12 work. The deployment token is never
// read or output.
// ============================================================================

@description('Azure region for the Static Web App (must be a Static-Web-Apps-supported region).')
param staticWebAppLocation string

@description('Tags applied to the Static Web App.')
param tags object

@description('Name of the Static Web App.')
param staticWebAppName string

resource staticWebApp 'Microsoft.Web/staticSites@2025-03-01' = {
  name: staticWebAppName
  location: staticWebAppLocation
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

@description('Name of the Static Web App.')
output staticWebAppName string = staticWebApp.name

@description('Resource ID of the Static Web App.')
output staticWebAppId string = staticWebApp.id

@description('Default hostname of the Static Web App.')
output defaultHostname string = staticWebApp.properties.defaultHostname
