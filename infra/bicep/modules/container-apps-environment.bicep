// ============================================================================
// container-apps-environment.bicep — the Container Apps managed environment.
//
// Scope: resource group.
//
// This is a WORKLOAD PROFILES environment holding exactly one profile:
// 'Consumption'. A workload profiles environment that contains only the
// Consumption profile has NO baseline node cost — billing stays per
// vCPU-second and GiB-second. Continuous cost would come only from a Dedicated
// profile with minimumCount > 0, which this template never creates. The
// Consumption profile is elastic by definition, so minimumCount / maximumCount
// are intentionally omitted (setting them has been reported to fail with a
// WorkloadProfileRelatedApiNotSupported-style error).
//
// The legacy "Consumption only" environment type was rejected: it is no longer
// offered in the portal, requires --enable-workload-profiles false, and needs a
// /23 subnet, which would force the VNet integration this phase excludes.
//
// The Log Analytics shared key is retrieved INSIDE this module via an `existing`
// reference plus listKeys(). It is never a parameter, never an output, and never
// passes through main.bicep.
// ============================================================================

@description('Azure region for the Container Apps environment.')
param location string

@description('Tags applied to the Container Apps environment.')
param tags object

@description('Name of the Container Apps managed environment.')
param containerAppsEnvironmentName string

@description('Name of the Log Analytics workspace that receives application logs (same resource group).')
param logAnalyticsWorkspaceName string

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

@description('Resource ID of the Container Apps environment.')
output containerAppsEnvironmentId string = containerAppsEnvironment.id

@description('Name of the Container Apps environment.')
output containerAppsEnvironmentName string = containerAppsEnvironment.name

@description('Default domain of the Container Apps environment (used to derive app FQDNs).')
output defaultDomain string = containerAppsEnvironment.properties.defaultDomain
