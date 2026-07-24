// ============================================================================
// monitoring.bicep — Log Analytics workspace + workspace-based Application
// Insights for the Quantora development environment.
//
// Scope: resource group (the default). Both resources are taggable and receive
// the root tag object unchanged.
//
// Deliberately NOT created here: alerts, action groups, dashboards, diagnostic
// settings, and saved queries. Those belong to later observability phases.
// ============================================================================

@description('Azure region for the monitoring resources.')
param location string

@description('Tags applied to every taggable resource in this module.')
param tags object

@description('Name of the Log Analytics workspace.')
param logAnalyticsWorkspaceName string

@description('Name of the workspace-based Application Insights component.')
param applicationInsightsName string

@description('Log Analytics interactive data retention, in days.')
param retentionInDays int

@description('''Daily ingestion cap, in GB. This is a COST GUARD, not an expected
ingestion volume: once the cap is reached, ingestion is dropped for the rest of
the UTC day. It bounds spend on a development workspace and is intentionally
low.''')
param dailyQuotaGb int

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    workspaceCapping: {
      dailyQuotaGb: dailyQuotaGb
    }
  }
}

// Workspace-based Application Insights: telemetry is stored in the Log Analytics
// workspace above, not in a classic (deprecated) standalone component.
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

@description('Resource ID of the Log Analytics workspace.')
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id

@description('Name of the Log Analytics workspace.')
output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name

@description('Resource ID of the Application Insights component.')
output applicationInsightsId string = applicationInsights.id
