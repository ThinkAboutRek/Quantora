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

@description('Deploy the manually triggered Django migration job. Off by default — the job is defined but not deployed.')
param deployMigrationJob bool = false

@description('Add the broad 0.0.0.0–0.0.0.0 PostgreSQL firewall rule (Azure services, any tenant). Off by default.')
param allowAzureServices bool = false

// The image reference is ONE complete, immutable value —
// <registry-login-server>/quantora/api@sha256:<digest> — and the identical value
// is handed to both consumers below. Neither module composes a tag internally.
//
// This root parameter deliberately keeps its empty default and carries NO length
// constraint. A constraint here would break the safe default state, where both
// consuming modules are disabled and no image exists yet. The @minLength(1)
// constraint lives on the MODULE parameters instead: a module's parameter
// constraints are evaluated only when the module is instantiated, so the value
// becomes required if and only if the corresponding flag is true, and ARM
// reports an error naming the parameter. (Bicep `assert` would express this at
// the root, but it is an experimental feature and this project uses stable
// features only.)
@description('Fully-qualified, digest-pinned Django image reference; consumed only when deployApiApp=true or deployMigrationJob=true, and identical for both.')
param apiContainerImage string = ''

@description('PostgreSQL administrator login. A parameter, never a literal.')
param postgresAdministratorLogin string = 'quantora_admin'

@secure()
@description('PostgreSQL administrator password. Required; no default.')
param postgresAdministratorPassword string

@secure()
@description('Django SECRET_KEY. Empty default is permitted so the deployApiApp=false branch validates without a secret; a non-empty value is required when deployApiApp=true (enforced by @minLength in the module).')
param djangoSecretKey string = ''

// --- Shared runtime values (app and job) -------------------------------------
// These three are root parameters rather than module-internal literals because
// the app and the migration job must agree on them exactly: the job connects to
// the same database with the same client TLS posture as the app.
@description('DJANGO_COOKIE_SAMESITE. "None" because the SPA is served from a different site than the API; valid only because both cookies are already Secure in the production settings module.')
param djangoCookieSameSite string = 'None'

@description('POSTGRES_SSLMODE. "verify-full" validates the chain AND the hostname; Azure Database for PostgreSQL requires TLS and the settings module has no default for this value.')
param postgresSslMode string = 'verify-full'

@description('POSTGRES_SSLROOTCERT. The Debian system CA bundle inside the image; required whenever the mode verifies, because libpq would otherwise look for ~/.postgresql/root.crt, which the non-root runtime user does not have.')
param postgresSslRootCert string = '/etc/ssl/certs/ca-certificates.crt'

// App-only (the migration job serves no request and forks no worker). Declared
// `string`, exactly like the postgresPort and postgresConnectTimeout values
// below: anything destined for a container environment variable is a string all
// the way through, so no conversion is performed at the environment entry. Only
// genuinely numeric ARM fields (apiContainerPort -> ingress targetPort) are int.
@description('WEB_CONCURRENCY — the Gunicorn worker count for the Django Container App, as a string.')
param apiWebConcurrency string = '2'

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
var migrationJobName = 'caj-${applicationName}-migrate-${environmentAbbreviation}-${locationAbbreviation}'
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

// The browser SPA is served from the Static Web App's own hostname, which is a
// different site from the Container App's ingress hostname. That single origin
// is therefore both the trusted CSRF origin and the one allowed credentialed
// CORS origin, and it is why the cookie SameSite policy has to be 'None'.
var frontendOrigin = 'https://${staticWebApp.outputs.defaultHostname}'

// The API app derives DJANGO_ALLOWED_HOSTS from its own name and the environment
// domain. The migration job has no ingress and no FQDN of its own, but the
// settings module requires the variable at import time, so it is given the same
// value from the same two inputs.
var apiAllowedHost = '${containerAppName}.${containerAppsEnvironment.outputs.defaultDomain}'

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
    djangoCsrfTrustedOrigins: frontendOrigin
    djangoCorsAllowedOrigins: frontendOrigin
    djangoCookieSameSite: djangoCookieSameSite
    // The runtime database user is, for now, the PostgreSQL administrator login.
    // A least-privilege application role is deferred to a later phase.
    databaseUsername: postgresAdministratorLogin
    databasePassword: postgresAdministratorPassword
    postgresHost: postgresql.outputs.postgresFullyQualifiedDomainName
    postgresPort: postgresPort
    databaseName: postgresql.outputs.databaseName
    postgresConnectTimeout: postgresConnectTimeout
    postgresSslMode: postgresSslMode
    postgresSslRootCert: postgresSslRootCert
    webConcurrency: apiWebConcurrency
    livenessPath: apiLivenessPath
    readinessPath: apiReadinessPath
  }
}

// The migration job is defined here but deployed only when
// deployMigrationJob=true. It receives the SAME image reference as the app.
module containerAppJobMigrate 'modules/container-app-job-migrate.bicep' = if (deployMigrationJob) {
  name: 'container-app-job-migrate'
  scope: resourceGroup
  params: {
    location: location
    tags: tags
    jobName: migrationJobName
    containerAppsEnvironmentId: containerAppsEnvironment.outputs.containerAppsEnvironmentId
    apiIdentityResourceId: identity.outputs.identityId
    acrLoginServer: containerRegistry.outputs.loginServer
    containerImage: apiContainerImage
    djangoSettingsModule: djangoSettingsModule
    djangoSecretKey: djangoSecretKey
    djangoAllowedHosts: apiAllowedHost
    databaseUsername: postgresAdministratorLogin
    databasePassword: postgresAdministratorPassword
    postgresHost: postgresql.outputs.postgresFullyQualifiedDomainName
    postgresPort: postgresPort
    databaseName: postgresql.outputs.databaseName
    postgresConnectTimeout: postgresConnectTimeout
    postgresSslMode: postgresSslMode
    postgresSslRootCert: postgresSslRootCert
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

// Safe-dereference form, matching the two conditional outputs above. The
// equivalent `deployMigrationJob ? containerAppJobMigrate.outputs.jobName : ''`
// is rejected with BCP318 (Bicep cannot narrow a conditional module from the
// flag), so the repository's existing `.?outputs … ?? ''` pattern is used.
@description('Django migration job name (empty unless deployMigrationJob=true).')
output migrationJobName string = containerAppJobMigrate.?outputs.jobName ?? ''
