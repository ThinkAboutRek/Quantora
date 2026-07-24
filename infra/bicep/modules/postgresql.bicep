// ============================================================================
// postgresql.bicep — PostgreSQL Flexible Server (Burstable B1ms), one database,
// and an OPTIONAL broad Azure-services firewall rule.
//
// Scope: resource group.
//
// Networking default: public network access is enabled with NO delegated subnet
// and NO firewall rules. With allowAzureServices=false there are zero firewall
// rules, so nothing — including the Container App and any migration job — can
// reach the database until a rule is added. See docs/operations/azure-foundation.md.
//
// The 0.0.0.0–0.0.0.0 rule (added only when allowAzureServices=true) permits
// connection attempts from Azure services in ANY tenant. It is NOT private, NOT
// subscription-scoped, and NOT secure by itself.
//
// Deliberately NOT configured: extensions, server parameters, read replicas,
// high availability, geo-redundant backup, private DNS zones, private endpoints,
// VNet integration, application database roles, and data migrations. charset and
// collation are left to the service defaults (never guessed).
// ============================================================================

@description('Azure region for the PostgreSQL flexible server.')
param location string

@description('Tags applied to the PostgreSQL flexible server.')
param tags object

@description('Globally unique PostgreSQL flexible server name.')
param postgresServerName string

@description('Name of the application database created on the server.')
param databaseName string

@description('PostgreSQL administrator login. A parameter (never a literal inside the resource) so the adminusername-should-not-be-literal rule is satisfied.')
param administratorLogin string

@secure()
@description('PostgreSQL administrator password. Supplied at deploy time; no default; never an output.')
param administratorPassword string

@description('''When true, add a single firewall rule 0.0.0.0–0.0.0.0 that allows
access from Azure services in any tenant. Broad; disabled by default.''')
param allowAzureServices bool

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
  name: postgresServerName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '17'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }

  // charset / collation intentionally omitted — service defaults are used.
  resource database 'databases@2025-08-01' = {
    name: databaseName
  }
}

// Broad Azure-services access. The well-known 0.0.0.0–0.0.0.0 rule is Azure's
// documented "allow access from Azure services" special case, not a real IP
// range. Present only when explicitly enabled.
resource allowAzureServicesRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2025-08-01' = if (allowAzureServices) {
  parent: postgresServer
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

@description('Name of the PostgreSQL flexible server.')
output postgresServerName string = postgresServer.name

@description('Resource ID of the PostgreSQL flexible server.')
output postgresServerId string = postgresServer.id

@description('Fully qualified domain name of the PostgreSQL flexible server.')
output postgresFullyQualifiedDomainName string = postgresServer.properties.fullyQualifiedDomainName

@description('Name of the application database.')
output databaseName string = databaseName
