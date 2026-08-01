// ============================================================================
// development.bicepparam — parameters for the Quantora development environment.
//
// A .bicepparam file cannot be combined with inline `--parameters key=value`
// overrides, so the two toggles, the image reference, and the two secrets are
// resolved through readEnvironmentVariable with literal defaults. With NO
// environment variables set, this file resolves to the safe default state:
// API app off, broad firewall off, no image, and no Django secret.
//
// The PostgreSQL administrator password has NO default: it is a required secret
// and must be supplied through QUANTORA_PG_ADMIN_PASSWORD. Nothing here holds a
// real secret value; the environment variables are never committed.
// ============================================================================

using '../main.bicep'

param deployApiApp = toLower(readEnvironmentVariable('QUANTORA_DEPLOY_API_APP', 'false')) == 'true'
param deployMigrationJob = toLower(readEnvironmentVariable('QUANTORA_DEPLOY_MIGRATION_JOB', 'false')) == 'true'
param allowAzureServices = toLower(readEnvironmentVariable('QUANTORA_ALLOW_AZURE_SERVICES', 'false')) == 'true'
param apiContainerImage = readEnvironmentVariable('QUANTORA_API_CONTAINER_IMAGE', '')
param postgresAdministratorPassword = readEnvironmentVariable('QUANTORA_PG_ADMIN_PASSWORD')
param djangoSecretKey = readEnvironmentVariable('QUANTORA_DJANGO_SECRET_KEY', '')

// Committed, non-secret runtime values shared by the Django app and the
// migration job. They are literals rather than environment reads: they are part
// of the environment's definition, not per-session operator input.
param djangoCookieSameSite = 'None'
param postgresSslMode = 'verify-full'
param postgresSslRootCert = '/etc/ssl/certs/ca-certificates.crt'
// Gunicorn worker count for the Django Container App. A string, because it
// becomes a container environment variable. Committed explicitly rather than
// inherited from the image ENV so the deployed value is reviewable here.
param apiWebConcurrency = '2'
