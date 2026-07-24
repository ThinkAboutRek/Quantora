// ============================================================================
// main.bicep — Quantora development environment, subscription-scoped root.
//
// Creates the development resource group and orchestrates every module into it.
// This is a thin-slice foundation: monitoring, one API identity, a container
// registry, a Container Apps environment, a PostgreSQL flexible server, a Static
// Web App, and — only when explicitly enabled — the Django Container App.
//
// NOTE on the deployment metadata location: the --location passed to a
// subscription-scope deployment controls only where Azure stores the deployment
// METADATA. It does not override any resource's own `location`; each resource is
// placed by its module's location parameter (uksouth here, westeurope for the
// Static Web App).
//
// No secret is ever output by this template (see the outputs section).
// ============================================================================

targetScope = 'subscription'

// --- Parameters -------------------------------------------------------------

@description('Application name used in resource naming and the unique suffix seed.')
param applicationName string = 'quantora'

@description('Full environment name used in the unique suffix seed.')
param environmentName string = 'development'

@description('Short environment abbreviation used in resource names.')
param environmentAbbreviation string = 'dev'

@description('Azure region for the regional resources and the deployment metadata.')
param location string = 'uksouth'

@description('Short region abbreviation used in resource names.')
param locationAbbreviation string = 'uks'

@description('Region for the Static Web App (UK South is not a Static-Web-Apps region).')
param staticWebAppLocation string = 'westeurope'

@description('Deploy the Django Container App. Off by default — the app is defined but not deployed.')
param deployApiApp bool = false

@description('Add the broad 0.0.0.0–0.0.0.0 PostgreSQL firewall rule (Azure services, any tenant). Off by default.')
param allowAzureServices bool = false

@description('Fully-qualified Django image reference; only consumed when deployApiApp=true.')
param apiContainerImage string = ''

@description('PostgreSQL administrator login. A parameter, never a literal.')
param postgresAdministratorLogin string = 'quantora_admin'

@secure()
@description('PostgreSQL administrator password. Required; no default.')
param postgresAdministratorPassword string

@secure()
@description('Django SECRET_KEY. Empty default is permitted so the deployApiApp=false branch validates without a secret; a non-empty value is required when deployApiApp=true (enforced by @minLength in the module).')
param djangoSecretKey string = ''

@description('Log Analytics interactive retention in days.')
param logAnalyticsRetentionDays int = 30

@description('Log Analytics daily ingestion cap in GB (cost guard).')
param logAnalyticsDailyQuotaGb int = 1

// --- Naming -----------------------------------------------------------------
// uniqueString is used ONLY where global uniqueness is required: the container
// registry and the PostgreSQL server. It is seeded identically for both and
// never from utcNow(), newGuid(), a deployment name, or a machine-specific value.
var uniqueSuffix = uniqueString(subscription().id, applicationName, environmentName)

var namePrefix = '${applicationName}-${environmentAbbreviation}-${locationAbbreviation}'

var resourceGroupName = 'rg-${namePrefix}'
var logAnalyticsWorkspaceName = 'log-${namePrefix}'
var applicationInsightsName = 'appi-${namePrefix}'
var managedIdentityName = 'id-${applicationName}-api-${environmentAbbreviation}-${locationAbbreviation}'
// ACR names are alphanumeric only — no hyphens permitted — so the prefix and
// suffix are concatenated without separators.
var containerRegistryName = 'cr${applicationName}${environmentAbbreviation}${uniqueSuffix}'
var containerAppsEnvironmentName = 'cae-${namePrefix}'
var containerAppName = 'ca-${applicationName}-api-${environmentAbbreviation}-${locationAbbreviation}'
var postgresServerName = 'psql-${namePrefix}-${uniqueSuffix}'
// The Static Web App lives in West Europe, so its name carries 'weu', not the
// regional abbreviation used by the UK South resources.
var staticWebAppName = 'stapp-${applicationName}-${environmentAbbreviation}-weu'

var databaseName = 'quantora'

// --- Repository contracts (confirmed from the Phase 10 image and Django app) --
var apiContainerPort = 8000
var djangoSettingsModule = 'core.settings.production'
var apiLivenessPath = '/api/v1/health/'
var apiReadinessPath = '/api/v1/health/ready/'
var postgresPort = '5432'
var postgresConnectTimeout = '3'

// --- Tags -------------------------------------------------------------------
var tags = {
  application: 'Quantora'
  environment: 'development'
  managedBy: 'bicep'
  repository: 'https://github.com/ThinkAboutRek/Quantora'
  workload: 'portfolio-analytics'
}

// --- Resource group ---------------------------------------------------------
resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// --- Modules (dependency order) ---------------------------------------------
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: resourceGroup
  params: {
    location: location
    tags: tags
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    applicationInsightsName: applicationInsightsName
    retentionInDays: logAnalyticsRetentionDays
    dailyQuotaGb: logAnalyticsDailyQuotaGb
  }
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  scope: resourceGroup
  params: {
    location: location
    tags: tags
    managedIdentityName: managedIdentityName
  }
}

module containerRegistry 'modules/container-registry.bicep' = {
  name: 'container-registry'
  scope: resourceGroup
  params: {
    location: location
    tags: tags
    containerRegistryName: containerRegistryName
    apiIdentityPrincipalId: identity.outputs.principalId
  }
}

module containerAppsEnvironment 'modules/container-apps-environment.bicep' = {
  name: 'container-apps-environment'
  scope: resourceGroup
  params: {
    location: location
    tags: tags
    containerAppsEnvironmentName: containerAppsEnvironmentName
    logAnalyticsWorkspaceName: monitoring.outputs.logAnalyticsWorkspaceName
  }
}

module postgresql 'modules/postgresql.bicep' = {
  name: 'postgresql'
  scope: resourceGroup
  params: {
    location: location
    tags: tags
    postgresServerName: postgresServerName
    databaseName: databaseName
    administratorLogin: postgresAdministratorLogin
    administratorPassword: postgresAdministratorPassword
    allowAzureServices: allowAzureServices
  }
}

module staticWebApp 'modules/static-web-app.bicep' = {
  name: 'static-web-app'
  scope: resourceGroup
  params: {
    staticWebAppLocation: staticWebAppLocation
    tags: tags
    staticWebAppName: staticWebAppName
  }
}

// The Django Container App is defined here but deployed only when deployApiApp=true.
module containerAppApi 'modules/container-app-api.bicep' = if (deployApiApp) {
  name: 'container-app-api'
  scope: resourceGroup
  params: {
    location: location
    tags: tags
    containerAppName: containerAppName
    containerAppsEnvironmentId: containerAppsEnvironment.outputs.containerAppsEnvironmentId
    environmentDefaultDomain: containerAppsEnvironment.outputs.defaultDomain
    apiIdentityResourceId: identity.outputs.identityId
    acrLoginServer: containerRegistry.outputs.loginServer
    containerImage: apiContainerImage
    containerPort: apiContainerPort
    djangoSettingsModule: djangoSettingsModule
    djangoSecretKey: djangoSecretKey
    // The runtime database user is, for now, the PostgreSQL administrator login.
    // A least-privilege application role is deferred to a later phase.
    databaseUsername: postgresAdministratorLogin
    databasePassword: postgresAdministratorPassword
    postgresHost: postgresql.outputs.postgresFullyQualifiedDomainName
    postgresPort: postgresPort
    databaseName: postgresql.outputs.databaseName
    postgresConnectTimeout: postgresConnectTimeout
    livenessPath: apiLivenessPath
    readinessPath: apiReadinessPath
  }
}

// --- Outputs (no secret is ever emitted) ------------------------------------
@description('Name of the development resource group.')
output resourceGroupName string = resourceGroup.name

@description('Container registry name.')
output containerRegistryName string = containerRegistry.outputs.containerRegistryName

@description('Container registry resource ID.')
output containerRegistryId string = containerRegistry.outputs.containerRegistryId

@description('Container registry login server.')
output containerRegistryLoginServer string = containerRegistry.outputs.loginServer

@description('Container Apps environment resource ID.')
output containerAppsEnvironmentId string = containerAppsEnvironment.outputs.containerAppsEnvironmentId

@description('Container Apps environment default domain.')
output containerAppsEnvironmentDefaultDomain string = containerAppsEnvironment.outputs.defaultDomain

@description('PostgreSQL server name.')
output postgresServerName string = postgresql.outputs.postgresServerName

@description('PostgreSQL server resource ID.')
output postgresServerId string = postgresql.outputs.postgresServerId

@description('PostgreSQL server FQDN.')
output postgresFullyQualifiedDomainName string = postgresql.outputs.postgresFullyQualifiedDomainName

@description('Application database name.')
output databaseName string = postgresql.outputs.databaseName

@description('Static Web App name.')
output staticWebAppName string = staticWebApp.outputs.staticWebAppName

@description('Static Web App resource ID.')
output staticWebAppId string = staticWebApp.outputs.staticWebAppId

@description('Static Web App default hostname.')
output staticWebAppDefaultHostname string = staticWebApp.outputs.defaultHostname

@description('API managed identity resource ID.')
output apiIdentityId string = identity.outputs.identityId

@description('API managed identity client ID.')
output apiIdentityClientId string = identity.outputs.clientId

@description('API managed identity principal ID.')
output apiIdentityPrincipalId string = identity.outputs.principalId

@description('Log Analytics workspace resource ID.')
output logAnalyticsWorkspaceId string = monitoring.outputs.logAnalyticsWorkspaceId

@description('Application Insights resource ID.')
output applicationInsightsId string = monitoring.outputs.applicationInsightsId

@description('Django Container App name (empty unless deployApiApp=true).')
output apiContainerAppName string = containerAppApi.?outputs.containerAppName ?? ''

@description('Django Container App FQDN (empty unless deployApiApp=true).')
output apiContainerAppFqdn string = containerAppApi.?outputs.containerAppFqdn ?? ''
