// ============================================================================
// container-app-job-migrate.bicep — the manually triggered Django migration job.
//
// Scope: resource group. Instantiated by main.bicep ONLY when
// deployMigrationJob=true. Like the API app module, the conditional
// instantiation is what makes @minLength(1) on the image and the Django secret
// meaningful: the constraint is evaluated only when the module is deployed, so
// an empty value becomes a clear ARM error naming the parameter rather than a
// silently broken job.
//
// The job runs the SAME image as the API app — never a second migration image.
// Migrations are never run during image build, during Bicep deployment, at
// application startup, or from a container entrypoint. This job is the one
// place they run, and an operator starts it by hand.
//
// Trigger is Manual: no schedule trigger, no event trigger, no ingress, and no
// scale rule. `replicaRetryLimit: 0` and `parallelism: 1` are deliberate — a
// failed migration must stay failed and be read, and two concurrent `migrate`
// processes against one database is never wanted.
//
// Image pull uses the same user-assigned managed identity + AcrPull grant as the
// API app. No registry username/password, no ACR admin account, no
// system-assigned identity, and no service principal are used.
// ============================================================================

@description('Azure region for the migration job.')
param location string

@description('Tags applied to the migration job.')
param tags object

@description('Name of the Django migration Container Apps Job.')
param jobName string

@description('Resource ID of the Container Apps managed environment.')
param containerAppsEnvironmentId string

@description('Resource ID of the user-assigned managed identity used for image pull.')
param apiIdentityResourceId string

@description('ACR login server (FQDN) the image is pulled from.')
param acrLoginServer string

@description('Fully-qualified container image reference (digest-pinned). Identical to the API app image; required and non-empty when this module is deployed.')
@minLength(1)
param containerImage string

@description('DJANGO_SETTINGS_MODULE dotted path for the production settings.')
param djangoSettingsModule string

@secure()
@description('Django SECRET_KEY. Required, non-empty, and stored as a job secret. Never an output.')
@minLength(1)
param djangoSecretKey string

@description('DJANGO_ALLOWED_HOSTS value. Required by the settings module at import time even though this job serves no request.')
param djangoAllowedHosts string

@description('Runtime database username (maps to POSTGRES_USER).')
param databaseUsername string

@secure()
@description('Runtime database password (maps to POSTGRES_PASSWORD). Stored as a job secret. Never an output. Named to match container-app-api.bicep: a generic runtime name, not a PostgreSQL administrator parameter name.')
param databasePassword string

@description('PostgreSQL host (FQDN) for POSTGRES_HOST.')
param postgresHost string

@description('PostgreSQL port for POSTGRES_PORT.')
param postgresPort string

@description('Application database name for POSTGRES_DB.')
param databaseName string

@description('POSTGRES_CONNECT_TIMEOUT in seconds (string).')
param postgresConnectTimeout string

@description('libpq client TLS mode for POSTGRES_SSLMODE. Identical to the API app value.')
param postgresSslMode string

@description('Certificate authority bundle path for POSTGRES_SSLROOTCERT. Identical to the API app value.')
param postgresSslRootCert string

// DJANGO_CSRF_TRUSTED_ORIGINS, DJANGO_CORS_ALLOWED_ORIGINS and
// DJANGO_COOKIE_SAMESITE are deliberately NOT set here. Each is optional in the
// settings package (`env.get_origin_list(..., [])` twice and
// `env.get_samesite(..., 'Lax')`), so their absence is valid, and none of them
// affects a management command that serves no request.
resource migrationJob 'Microsoft.App/jobs@2026-01-01' = {
  name: jobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${apiIdentityResourceId}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      // Ten minutes is far beyond what this migration set needs and still bounds
      // a job that hangs on an unreachable database.
      replicaTimeout: 600
      // No automatic retry: a partially applied migration must be inspected by
      // an operator, never re-attempted blindly.
      replicaRetryLimit: 0
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
          name: 'quantora-migrate'
          image: containerImage
          // Exec form, never a shell string: no shell is involved, so nothing
          // in the arguments can be word-split or expanded.
          command: [
            'python'
          ]
          args: [
            'manage.py'
            'migrate'
            '--noinput'
          ]
          // Matches the API app exactly, so the job cannot succeed under a
          // resource shape the app would not get.
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
              value: djangoAllowedHosts
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
            {
              name: 'POSTGRES_SSLMODE'
              value: postgresSslMode
            }
            {
              name: 'POSTGRES_SSLROOTCERT'
              value: postgresSslRootCert
            }
          ]
        }
      ]
    }
  }
}

@description('Name of the Django migration Container Apps Job. The only output; no secret is emitted.')
output jobName string = migrationJob.name
