// ============================================================================
// container-app-api.bicep — the Django API Container App.
//
// Scope: resource group. Instantiated by main.bicep ONLY when deployApiApp=true.
// Because the module is conditional, the @minLength(1) decorators on the image
// and the Django secret turn an empty value into a clear ARM error at deploy
// time rather than a silently broken app.
//
// Image pull uses the user-assigned managed identity + AcrPull (see
// container-registry.bicep). No registry username/password, no ACR admin
// account, no system-assigned identity, and no service principal are used.
//
// Sessions are database-backed, so ingress stickySessions/affinity is NOT
// configured — the app must stay correct across more than one replica.
// ============================================================================

@description('Azure region for the Container App.')
param location string

@description('Tags applied to the Container App.')
param tags object

@description('Name of the Django API Container App.')
param containerAppName string

@description('Resource ID of the Container Apps managed environment.')
param containerAppsEnvironmentId string

@description('Default domain of the Container Apps environment; used to derive the app FQDN for DJANGO_ALLOWED_HOSTS.')
param environmentDefaultDomain string

@description('Resource ID of the user-assigned managed identity used for image pull.')
param apiIdentityResourceId string

@description('ACR login server (FQDN) the image is pulled from.')
param acrLoginServer string

@description('Fully-qualified container image reference (digest-pinned). Required and non-empty when this module is deployed.')
@minLength(1)
param containerImage string

@description('Container port the app listens on (the confirmed Gunicorn bind port).')
param containerPort int

@description('DJANGO_SETTINGS_MODULE dotted path for the production settings.')
param djangoSettingsModule string

@secure()
@description('Django SECRET_KEY. Required, non-empty, and stored as a Container App secret. Never an output.')
@minLength(1)
param djangoSecretKey string

@description('Runtime database username (maps to POSTGRES_USER). Deliberately a generic runtime name, not a PostgreSQL administrator parameter name.')
param databaseUsername string

@secure()
@description('Runtime database password (maps to POSTGRES_PASSWORD). Stored as a Container App secret. Never an output.')
param databasePassword string

@description('PostgreSQL host (FQDN) for POSTGRES_HOST.')
param postgresHost string

@description('PostgreSQL port for POSTGRES_PORT.')
param postgresPort string

@description('Application database name for POSTGRES_DB.')
param databaseName string

@description('POSTGRES_CONNECT_TIMEOUT in seconds (string). Kept below the readiness probe timeout so a down database yields a clean 503, not a probe timeout.')
param postgresConnectTimeout string

@description('Database-independent liveness path (with trailing slash).')
param livenessPath string

@description('Database-backed readiness path (with trailing slash).')
param readinessPath string

// ---------------------------------------------------------------------------
// Probe timings — chosen and justified:
//
// Startup (liveness path, DB-independent): gates the liveness and readiness
//   probes while Gunicorn forks its sync worker and Django imports the app.
//   initialDelay 5s + up to 12 * 5s = ~65s budget before the container is
//   declared failed — generous headroom over the few seconds a sync worker
//   actually needs, without masking a genuinely broken image.
//
// Liveness (liveness path, DB-independent): restarts the container only when the
//   PROCESS is wedged. It never touches the database, so a database outage can
//   never trigger a restart. 3 failures * 30s ≈ 90s of unresponsiveness first.
//
// Readiness (readiness path, DB-backed): removes the replica from rotation
//   WITHOUT restarting it. timeoutSeconds (5s) intentionally exceeds
//   POSTGRES_CONNECT_TIMEOUT (3s) so a down database surfaces as a real 503 read
//   inside the probe window rather than a probe timeout.
//
// Every path keeps its trailing slash: Django APPEND_SLASH would answer a
// slash-less URL with a 301, and Container Apps treats any 2xx/3xx as success,
// so a missing slash would pass without ever reaching the real view.
// ---------------------------------------------------------------------------

resource containerApp 'Microsoft.App/containerApps@2026-01-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${apiIdentityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        allowInsecure: false
        targetPort: containerPort
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          identity: apiIdentityResourceId
        }
      ]
      secrets: [
        {
          name: 'django-secret-key'
          value: djangoSecretKey
        }
        {
          name: 'database-password'
          value: databasePassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'quantora-api'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: [
            {
              name: 'DJANGO_SETTINGS_MODULE'
              value: djangoSettingsModule
            }
            {
              name: 'DJANGO_SECRET_KEY'
              secretRef: 'django-secret-key'
            }
            {
              name: 'DJANGO_ALLOWED_HOSTS'
              value: '${containerAppName}.${environmentDefaultDomain}'
            }
            {
              name: 'POSTGRES_HOST'
              value: postgresHost
            }
            {
              name: 'POSTGRES_PORT'
              value: postgresPort
            }
            {
              name: 'POSTGRES_DB'
              value: databaseName
            }
            {
              name: 'POSTGRES_USER'
              value: databaseUsername
            }
            {
              name: 'POSTGRES_PASSWORD'
              secretRef: 'database-password'
            }
            {
              name: 'POSTGRES_CONNECT_TIMEOUT'
              value: postgresConnectTimeout
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: livenessPath
                port: containerPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 12
              successThreshold: 1
            }
            {
              type: 'Liveness'
              httpGet: {
                path: livenessPath
                port: containerPort
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 3
              failureThreshold: 3
              successThreshold: 1
            }
            {
              type: 'Readiness'
              httpGet: {
                path: readinessPath
                port: containerPort
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
              successThreshold: 1
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

@description('Name of the Django API Container App.')
output containerAppName string = containerApp.name

@description('Public FQDN of the Django API Container App.')
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
