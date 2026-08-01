# Azure Foundation (Bicep thin-slice environment)

This document describes the initial Azure infrastructure for Quantora: the Bicep
source under [`infra/bicep/`](../../infra/bicep/), what it provisions, and the
operator actions required to deploy it. It is the authoritative reference for the
Phase 11 foundation and the boundary with the Phase 12 application cutover.

Phase 11 **defines** infrastructure. It creates no Azure resources, pushes no
image, runs no migration, and deploys no application. The operator performs the
actual deployment after reviewing this document and the Bicep.

> **The deployment itself is [First Azure deployment](first-azure-deployment.md).**
> That document is the Phase 12 operator runbook: the three deployment states,
> the eight gates, secret handling, the manual migration job, proxy-aware HTTPS,
> PostgreSQL client TLS, cross-origin sessions, Static Web Apps routing, and
> rollback. This document remains the reference for what the infrastructure *is*.

---

## Phase 11 versus Phase 12 boundary

**Phase 11 (this phase) delivers:**

* Bicep source: one subscription-scoped root, seven modules, one linter config.
* One development parameter file wired to environment variables.
* This operations document and the supporting documentation pointers.
* Offline verification (build, lint, format, parameter compilation).

**Phase 11 explicitly does not:**

* Create a resource group or any resource.
* Register resource providers (a subscription mutation — operator action).
* Build, tag, or push a container image.
* Run database migrations.
* Deploy the Django Container App or the React bundle.
* Create a Git commit (the operator commits after review).

**Phase 12 (later) owns** the application cutover: pushing the Phase 10 image,
running migrations via a Container Apps Job, deploying the Django Container App
(`deployApiApp=true`), deploying the React artifact, opening database access,
and finishing the cross-origin, TLS, and proxy-header application settings.

---

## Architecture and the deployment-metadata location

[`main.bicep`](../../infra/bicep/main.bicep) targets **subscription** scope. It
creates the development resource group and deploys every module into it.

The `--location` passed to a subscription-scope deployment controls only where
Azure stores the deployment **metadata**. It does **not** override any
resource's own `location`. Each resource is placed by its module's `location`
parameter: UK South for the regional resources, West Europe for the Static Web
App.

### Module map

| Module | Purpose |
| ------ | ------- |
| [`modules/monitoring.bicep`](../../infra/bicep/modules/monitoring.bicep) | Log Analytics workspace + workspace-based Application Insights |
| [`modules/identity.bicep`](../../infra/bicep/modules/identity.bicep) | User-assigned managed identity for the Django API |
| [`modules/container-registry.bicep`](../../infra/bicep/modules/container-registry.bicep) | Container registry (Basic) + registry-scoped AcrPull grant |
| [`modules/container-apps-environment.bicep`](../../infra/bicep/modules/container-apps-environment.bicep) | Container Apps managed environment (workload profiles, Consumption only) |
| [`modules/postgresql.bicep`](../../infra/bicep/modules/postgresql.bicep) | PostgreSQL Flexible Server + database + optional broad firewall rule |
| [`modules/static-web-app.bicep`](../../infra/bicep/modules/static-web-app.bicep) | Static Web App (Free) |
| [`modules/container-app-api.bicep`](../../infra/bicep/modules/container-app-api.bicep) | Django API Container App (conditional; off by default) |
| [`modules/container-app-job-migrate.bicep`](../../infra/bicep/modules/container-app-job-migrate.bicep) | Manually triggered Django migration job (conditional; off by default). **Added by Phase 12 enablement**, not Phase 11. |

### Resource map

| Resource | Name | Region |
| -------- | ---- | ------ |
| Resource group | `rg-quantora-dev-uks` | UK South (metadata) |
| Log Analytics workspace | `log-quantora-dev-uks` | UK South |
| Application Insights | `appi-quantora-dev-uks` | UK South |
| Managed identity | `id-quantora-api-dev-uks` | UK South |
| Container registry | `crquantoradev<suffix>` | UK South |
| Container Apps environment | `cae-quantora-dev-uks` | UK South |
| PostgreSQL server | `psql-quantora-dev-uks-<suffix>` | UK South |
| Database | `quantora` | UK South |
| Static Web App | `stapp-quantora-dev-weu` | West Europe |
| Django Container App (conditional) | `ca-quantora-api-dev-uks` | UK South |

---

## Naming, tags, and the stable unique suffix

Names follow `<type>-quantora-<env>-<region>`. `uniqueString(subscription().id,
applicationName, environmentName)` seeds a **stable** suffix used only where
global uniqueness is required: the container registry and the PostgreSQL server.
The seed is deterministic, so redeployment produces the same names. It is never
seeded from `utcNow()`, `newGuid()`, a deployment name, an operator name, an
email address, or any machine-specific value. Container registry names are
alphanumeric only, so the registry name concatenates its parts without hyphens.

Every taggable resource carries one root tag object:

```
application: Quantora
environment: development
managedBy:   bicep
repository:  https://github.com/ThinkAboutRek/Quantora
workload:    portfolio-analytics
```

No personal name, email, subscription ID, tenant ID, machine name, Windows
username, creation-date tag, or invented governance classification is included.

---

## Regions and the Static Web Apps exception

Regional resources live in **UK South**. Static Web Apps is **not** available in
UK South, so the Static Web App uses a separate `staticWebAppLocation` parameter
defaulting to **West Europe**. Static Web Apps supports only a small set of
regions (`westus2`, `centralus`, `eastus2`, `westeurope`, `eastasia`). Confirm
the current supported set against the live provider metadata rather than trusting
any fixed list.

`northeurope` is the documented primary fallback for the regional resources. Any
region change requires operator approval. `ukwest` must not be proposed for
Container Apps unless the `Microsoft.App/managedEnvironments` provider metadata
positively lists it.

---

## API versions

All resources use the latest **stable** (generally available) API version known
to the Bicep toolchain, resolved from the installed type metadata:

| Resource type | API version |
| ------------- | ----------- |
| `Microsoft.Resources/resourceGroups` | `2025-04-01` |
| `Microsoft.OperationalInsights/workspaces` | `2025-07-01` |
| `Microsoft.Insights/components` | `2020-02-02` |
| `Microsoft.ManagedIdentity/userAssignedIdentities` | `2024-11-30` |
| `Microsoft.ContainerRegistry/registries` | `2025-11-01` (pinned) |
| `Microsoft.Authorization/roleAssignments` | `2022-04-01` |
| `Microsoft.App/managedEnvironments` | `2026-01-01` |
| `Microsoft.App/containerApps` | `2026-01-01` |
| `Microsoft.App/jobs` | `2026-01-01` (added by Phase 12 enablement) |
| `Microsoft.DBforPostgreSQL/flexibleServers` (+ `databases`, `firewallRules`) | `2025-08-01` |
| `Microsoft.Web/staticSites` | `2025-03-01` |

The container registry is pinned to `2025-11-01` deliberately: it is the first
stable version that exposes `roleAssignmentMode`. The stable `2025-04-01` omits
that property, so it would silently drop the setting and leave the registry on a
service default. `roleAssignmentMode` accepts `LegacyRegistryPermissions` or
`AbacRepositoryPermissions`; this template sets `LegacyRegistryPermissions`.

`Microsoft.Insights/components@2020-02-02` and
`Microsoft.Authorization/roleAssignments@2022-04-01` are older than the linter's
730-day recency window but are the newest **stable** versions their resource
types publish (newer versions are preview only). The `use-recent-api-versions`
rule is set to `warning` for this reason; the build is nonetheless clean because
each version is the most recent stable one available.

---

## Linter configuration and suppressions

[`bicepconfig.json`](../../infra/bicep/bicepconfig.json) sets the secure and
correctness rules (secure-secret handling, secret-free outputs, non-literal admin
username, unused params/vars, nested-deployment scoping) to `error`, and
`use-recent-api-versions` to `warning` at **730 days under both key names**
(`maxAgeInDays` and `maxAllowedAgeInDays`).

**No suppressions are used anywhere in the Bicep.** Format, build, and lint all
pass with zero diagnostics, so no `#disable-next-line` directive was necessary.
Should a future change require one, it must be a single line naming the exact
rule with a same-line reason, and it must be recorded here.

`use-recent-api-versions` is `warning` rather than `error` because ACR, Container
Apps, and PostgreSQL all publish newer **preview** versions than their newest
stable version, and the rule counts preview versions; at `error` this would force
a suppression comment on nearly every module. The control is preserved by
requiring every finding to be fixed or justified in writing.

**Configuration key, resolved empirically.** The recency threshold is set under
`maxAgeInDays`, which is the key that actually changes behaviour in the installed
Bicep CLI (0.45.15). This was confirmed by test: with the rule at value `0`, a
resource pinned to a within-window-but-not-latest API version
(`Microsoft.OperationalInsights/workspaces@2025-02-01`) produced a finding **only**
under `maxAgeInDays`; under `maxAllowedAgeInDays` — the name in Microsoft's current
published reference — it produced none, so that name is inert in this CLI. At value
`0`, no resource in this template (including `Microsoft.Insights/components@2020-02-02`)
produces a finding, because the rule accepts a version that is the newest **stable**
one regardless of its age. A consequence worth stating plainly: the API-version
selections are correct, but the positive evidence for the two genuinely old pins
(`components@2020-02-02`, `roleAssignments@2022-04-01`) is "no newer stable version
exists," not "within the recency window" — the threshold never gates a
newest-stable version.

**Both key names are set to 730.** `maxAgeInDays` is the key the installed CLI
honours; `maxAllowedAgeInDays` is the name in Microsoft's current published
reference and is inert in this CLI. Because an unrecognised key is **silently
ignored** (proven above), carrying both is harmless today and guards against a
future Bicep release that switches to the documented name silently reverting the
threshold to its built-in default. Whichever name the running CLI recognises, the
threshold stays 730.

---

## Resource-provider preflight (operator action)

Provider registration is a subscription mutation and is **not** performed by this
phase. Before the first deployment, the operator confirms each provider is
`Registered`:

```powershell
foreach ($ns in @('Microsoft.OperationalInsights','Microsoft.Insights','Microsoft.ManagedIdentity','Microsoft.ContainerRegistry','Microsoft.App','Microsoft.DBforPostgreSQL','Microsoft.Web')) {
  az provider show --namespace $ns --query "{ns:namespace, state:registrationState}" --output tsv
}
```

Any namespace that is not `Registered` is registered explicitly by the operator:

```powershell
az provider register --namespace <namespace>
```

This requires `Microsoft.Resources/subscriptions/providers/register/action`,
held by Contributor and Owner.

---

## Operator RBAC requirements

The registry module creates a role assignment (AcrPull for the API identity).
Creating role assignments requires `Microsoft.Authorization/roleAssignments/write`,
which **Contributor does not have**. The operator needs one of:

* `Role Based Access Control Administrator` scoped to the resource group (narrowest), or
* `User Access Administrator`, or
* `Owner`.

If the operator lacks this permission, the template still validates and previews
with `--validation-level ProviderNoRbac` (which checks read permissions only),
but the AcrPull assignment cannot be created until the permission is granted. Do
not work around this by enabling the ACR administrator account or a registry
password — image pull is identity-based by design.

---

## Secret handling and secure-parameter flow

* `postgresAdministratorPassword` and `djangoSecretKey` are `@secure()`
  parameters. The password has no default (required); the Django secret defaults
  to an empty string so the `deployApiApp=false` branch validates without a
  secret. An empty-string default is permitted by the `secure-parameter-default`
  rule, which rejects only hard-coded non-empty defaults.
* Secrets are supplied at deploy time through environment variables read by
  [`environments/development.bicepparam`](../../infra/bicep/environments/development.bicepparam)
  (`QUANTORA_PG_ADMIN_PASSWORD`, `QUANTORA_DJANGO_SECRET_KEY`). These environment
  variables are never committed. The committed parameter file holds no real value.
* Inside the Django Container App, the Django secret and the database password
  are stored as Container App **secrets** and referenced by `secretRef`; they are
  never inlined as environment-variable values.
* The Log Analytics **shared key** is retrieved inside
  `container-apps-environment.bicep` via an `existing` reference plus
  `listKeys()`. It is never a module parameter, never an output, and never passes
  through `main.bicep`.

### Secure-output behaviour

Bicep 0.35.1 and later supports `@secure()` on outputs, and such outputs are kept
out of deployment logs and history. Quantora needs no secure output, so **no
output — secure or otherwise — carries a secret**. Nothing emits the PostgreSQL
password, the Django secret, Container App secret values, the Static Web Apps
deployment token, ACR credentials, the Log Analytics shared key, the Application
Insights connection string, or any credential-bearing connection string.

---

## The API managed identity and the ACR pull role

`identity.bicep` creates exactly one user-assigned managed identity,
`id-quantora-api-dev-uks`, for the Django API. A user-assigned identity has no
client secret, so none is created. Identities for the market-data service, the
risk-engine service, the Celery worker, Celery Beat, the Static Web App, and
deployment automation are deferred (see the deferred-work section).

`container-registry.bicep` grants **AcrPull** (role definition
`7f951dda-4ed3-4680-a7ca-43fe172d538d`) to that identity, scoped to the registry
resource only, with `principalType: 'ServicePrincipal'` and a deterministic name.
The registry is set to `roleAssignmentMode: 'LegacyRegistryPermissions'` so that
the built-in AcrPull role is honoured. Under `AbacRepositoryPermissions`
(repository-level ABAC), AcrPull is not honoured; a future move to ABAC would
require replacing AcrPull with an appropriate repository-reader role and
revisiting this property.

**ARM audience tokens (added by Phase 12 enablement).** The registry also
declares `properties.policies.azureADAuthenticationAsArmPolicy.status: 'enabled'`
(lowercase — the ContainerRegistry policy status enum is lowercase in Microsoft's
examples and in `az acr config authentication-as-arm update --status`).
Container Apps managed-identity image pull exchanges an **ARM audience** token at
the registry, so a registry that refuses them cannot be pulled from by a managed
identity at all — this is a hard prerequisite, not a hardening option. It is
declared explicitly rather than left to the service default so the template stays
the source of truth: a future subscription policy disabling ARM audience tokens
would be reverted by the next deployment. The property is confirmed **expressible**
at the pinned `2025-11-01` API version (the Bicep type metadata resolves
`AzureADAuthenticationAsArmPolicy`), but — exactly like `roleAssignmentMode` — the
enum value is typed loosely, so offline verification cannot prove ARM accepts
`'enabled'`; a casing mismatch would compile and preview cleanly and surface only
at Deployment A. That is a Phase 12 deployment-evidence item.

**ARM enum acceptance is not yet proven.** `LegacyRegistryPermissions` is set
explicitly and appears in the what-if evaluated payload with no rejection, but that
is not proof ARM accepts the enum value: validation short-circuited the registry
module (see the validation note), what-if does not enforce enum constraints, and
Bicep types `roleAssignmentMode` loosely (`null | string`), so a wrong value would
compile and preview cleanly and fail only at deployment. This is carried on the
Phase 12 watch list (see the carry-forward obligations).

---

## The Container Apps environment

`container-apps-environment.bicep` creates a **workload profiles** environment
holding exactly one profile:

```
name: Consumption
workloadProfileType: Consumption
```

`minimumCount` / `maximumCount` are intentionally omitted — the Consumption
profile is elastic, and setting counts on it has been reported to fail with a
`WorkloadProfileRelatedApiNotSupported`-style error.

A workload profiles environment holding only the Consumption profile has **no
baseline node cost**; billing stays per vCPU-second and GiB-second. Continuous
node cost would come only from a Dedicated profile with `minimumCount > 0`, which
this template never creates.

The legacy **Consumption-only** environment type was rejected: it is no longer
offered in the portal, requires `--enable-workload-profiles false`, and needs a
`/23` subnet, which would force the VNet integration this phase excludes.

Dapr, VNet configuration, internal-only mode, private endpoints, NAT gateway,
custom domains, and any Dedicated profile are deliberately not configured.
`zoneRedundant` is `false`.

---

## Conditional Django Container App

`container-app-api.bicep` is instantiated by `main.bicep` only when
`deployApiApp=true`, which is **off by default**. Because the module is
conditional, `@minLength(1)` on the image and the Django secret turns an empty
value into a clear ARM error rather than a silently broken app. There is no
placeholder image and no placeholder revision.

When deployed:

* Image pull uses the user-assigned identity + AcrPull. No registry username or
  password, no ACR admin account, no system-assigned identity, and no service
  principal is used.
* Ingress is external, `allowInsecure: false`, `transport: 'auto'`, targeting the
  confirmed container port **8000** (the Phase 10 Gunicorn bind port).
* `stickySessions` is not configured — sessions are database-backed and must stay
  correct across more than one replica.
* Scale is `minReplicas: 0`, `maxReplicas: 1`; resources are `0.5` vCPU / `1.0Gi`;
  `workloadProfileName: 'Consumption'`.

### Runtime environment variables

Only variables the production settings module
(`core.settings.production`) actually reads are set:

| Variable | Source |
| -------- | ------ |
| `DJANGO_SETTINGS_MODULE` | `core.settings.production` (selects production settings) |
| `DJANGO_SECRET_KEY` | Container App secret `django-secret-key` |
| `DJANGO_ALLOWED_HOSTS` | the app FQDN (`<app>.<environment-default-domain>`) |
| `POSTGRES_HOST` | PostgreSQL server FQDN |
| `POSTGRES_PORT` | `5432` |
| `POSTGRES_DB` | `quantora` |
| `POSTGRES_USER` | the runtime database user |
| `POSTGRES_PASSWORD` | Container App secret `database-password` |
| `POSTGRES_CONNECT_TIMEOUT` | `3` (bounded, ≥ 2; below the readiness probe timeout) |

The six rows below were **added by Phase 12 enablement**. The migration job
receives `POSTGRES_SSLMODE` and `POSTGRES_SSLROOTCERT` as well; it deliberately
receives none of the others (the three Django cross-origin/cookie variables are
each optional in the settings package, and neither they nor the worker count
affect a management command that serves no request):

| Variable | Source |
| -------- | ------ |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | the Static Web App default hostname, as `https://<hostname>` |
| `DJANGO_CORS_ALLOWED_ORIGINS` | the same single exact origin |
| `DJANGO_COOKIE_SAMESITE` | `None` — the SPA is cross-**site**, and both cookies are already Secure |
| `POSTGRES_SSLMODE` | `verify-full` (root parameter; required by the settings module, which has no default) |
| `POSTGRES_SSLROOTCERT` | `/etc/ssl/certs/ca-certificates.crt` (root parameter; required whenever the mode verifies) |
| `WEB_CONCURRENCY` | `2`, committed in [`development.bicepparam`](../../infra/bicep/environments/development.bicepparam) as the root parameter `apiWebConcurrency`, which feeds the module's `webConcurrency` |

**`WEB_CONCURRENCY` is now set here.** Phase 11 deliberately omitted it because it
is read by Gunicorn rather than by the Django settings module, and the Phase 10
image already bakes `WEB_CONCURRENCY=2`; that omission is reversed. The value now
lives in **two** places — the image `ENV` and this template — and the template
wins, because a Container App environment variable overrides the image's `ENV` for
the same name; the image default only applies where the template does not set it
(the migration job, and any plain `docker run`). Keeping both means the worker
count is explicit and reviewable in the deployment descriptor without the image
losing a sane standalone default.

The proxy-header setting is a **literal in the settings module**, not an
environment variable, so it appears in no table here (see
[First Azure deployment](first-azure-deployment.md) §7).

### Probes

All three probes use `scheme: 'HTTP'`, the confirmed container port, and the
Phase 10 endpoints **including their trailing slashes**. The trailing slash is
not cosmetic: Django's `APPEND_SLASH` answers a slash-less URL with a 301, and
Container Apps treats any 2xx/3xx as success, so a missing slash would pass
without ever reaching the real view.

Every value below matches
[`container-app-api.bicep`](../../infra/bicep/modules/container-app-api.bicep).

| Probe | Path | Port | Scheme | initialDelaySeconds | periodSeconds | timeoutSeconds | failureThreshold | successThreshold | Reasoning |
| ----- | ---- | ---- | ------ | ------------------- | ------------- | -------------- | ---------------- | ---------------- | --------- |
| Startup | `/api/v1/health/` (DB-independent) | 8000 | HTTP | 5 | 5 | 3 | 12 | 1 | ~65 s budget (5 + 12×5) for Gunicorn to fork its sync worker and Django to import the app before the container is declared failed; gates the other two probes. |
| Liveness | `/api/v1/health/` (DB-independent) | 8000 | HTTP | 0 *(default)* | 30 | 3 | 3 | 1 | Restarts only a genuinely wedged process (~90 s of failures). DB-independent, so a database outage can never trigger a restart. |
| Readiness | `/api/v1/health/ready/` (DB-backed, `SELECT 1`) | 8000 | HTTP | 0 *(default)* | 10 | 5 | 3 | 1 | De-rotates the replica **without** restarting it. `timeoutSeconds` (5) exceeds `POSTGRES_CONNECT_TIMEOUT` (3) so a down database surfaces as a real 503, not a probe timeout. |

Values relying on an Azure default rather than being set explicitly:
`initialDelaySeconds` is **not** set on the Liveness and Readiness probes and uses
the Container Apps default of **0** — the Startup probe gates both regardless, so
an explicit initial delay is unnecessary. `successThreshold` is set explicitly to
`1` on all three (Container Apps requires `1` for Startup and Liveness). Every
other value in the table is set explicitly in the module.

No Dockerfile `HEALTHCHECK`, Redis check, or other future-service check is added.

---

## PostgreSQL networking and the broad firewall override

`postgresql.bicep` provisions a Burstable **Standard_B1ms** flexible server,
PostgreSQL **17**, 32 GB storage with auto-grow disabled, 7-day backup retention,
geo-redundant backup disabled, high availability disabled, and **public network
access enabled with no delegated subnet**. `charset` and `collation` are left to
the service defaults. The database `quantora` is created; no extensions, server
parameters, replicas, HA, geo-backup, private DNS, private endpoints, VNet
integration, application roles, or migrations are configured.

By default (`allowAzureServices=false`) there are **zero firewall rules**, so
nothing can reach the database. When `allowAzureServices=true`, a single firewall
rule `0.0.0.0`–`0.0.0.0` is added.

That `0.0.0.0`–`0.0.0.0` rule is Azure's "allow access from Azure services"
special case. It permits connection attempts from Azure services in **any
tenant** — not only this subscription. It is **not** private, **not**
subscription-scoped, **not** Container-Apps-only, and **not** secure by itself. It
is a broad, deliberate override that must be enabled consciously.

### Sequencing consequence

With `allowAzureServices=false` and no firewall rules at all, **nothing reaches
the database, including the Phase 12 migration job and the Container App
readiness probe**. When the Django app is deployed against this default, it will
start, fail readiness, and serve 503s until the firewall is explicitly opened by
operator override. This is the correct default and must not later be
misdiagnosed as a bug.

### Temporary use of administrator credentials

The runtime database user is, for now, the PostgreSQL **administrator** login
(`quantora_admin` by default). This is a deliberate temporary simplification. A
least-privilege application database role is deferred to a later phase; the
administrator credentials should be replaced by an application role before the
environment carries anything beyond development data.

---

## The manual migration-job sequence (Phase 12, documented not built)

Phase 11 creates **no** migration job. The Phase 12 cutover runs in this exact
order:

1. Deploy infrastructure with `deployApiApp=false`.
2. Build, tag, and push the Phase 10 Django image to ACR.
3. Create or update a **manually triggered Azure Container Apps Job** using that
   same image.
4. Run the job once with `python manage.py migrate --noinput`.
5. Wait for successful completion.
6. Verify migration state.
7. Deploy the Django Container App with `deployApiApp=true`.
8. Deploy the React artifact.
9. Perform smoke verification.

The migration job will need: the ACR login server and image reference; the API
managed identity (for image pull); the Container Apps environment ID; the
PostgreSQL host, database name, user, and password; and — because the default has
no firewall rule — database access opened for the duration of the migration.

Do **not** use `az containerapp exec` as the primary migration mechanism: at
migration time the app does not yet exist. Migrations are never run during Bicep
deployment, at app startup, during image build, from a container entrypoint, or
from a separate migration image.

Using a Container Apps Job for isolated migration is consistent with
[ADR 002](../adr/0002-asynchronous-job-strategy.md), which permits Container Apps
Jobs for isolated maintenance, migrations, and backfills while excluding them
from the V1 application job workflow. This is a documentation note, not an ADR
amendment.

---

## Carry-forward application obligations for Phase 12

These are application-settings changes Phase 12 must make. **Phase 11 does not
modify the Phase 10 image or Django settings to implement them.**

> **Status after Phase 12 enablement: every item below is still OPEN.** The
> repository enablement commit writes the settings and the Bicep, but writing
> source is not evidence. Each item is **carried into the deployment sequence**
> in [First Azure deployment](first-azure-deployment.md) and is resolved only by
> observed behaviour against real Azure resources — which belongs to the
> deployment commit, not to this one. Nothing here is marked resolved.

1. **`SECURE_PROXY_SSL_HEADER` — required before the first Phase 12 deployment.**
   HTTPS redirects are **already on**, not a switch Phase 12 turns on: the
   production settings module reads `DJANGO_SECURE_SSL_REDIRECT` with a default of
   **True**, and this template does not set the variable, so the app ships with
   redirects enabled. `SECURE_PROXY_SSL_HEADER` must therefore be configured
   **before the app is deployed for the first time**, not afterwards.

   Container Apps terminates TLS at the edge and forwards plain HTTP to the
   container. With `SECURE_PROXY_SSL_HEADER` unset, Django treats every forwarded
   request as insecure and answers with a 301 to HTTPS, which returns through the
   same edge as plain HTTP again — an **infinite redirect loop**.

   The failure is **invisible to the probes**: Container Apps treats any status
   from 200 to 399 as probe success, so all three probes receive the 301 and
   report the app **healthy while it is completely unusable**. Probe success on a
   301 is exactly why the health checks cannot catch this, and why it must be
   fixed before the first deployment rather than diagnosed after it.

   Phase 12 fixes it by setting `SECURE_PROXY_SSL_HEADER` (expected
   `('HTTP_X_FORWARDED_PROTO', 'https')`, to be verified against the Container Apps
   forwarded headers). Phase 11 changes no Django setting, Dockerfile, or Container
   App environment variable to work around it.
2. **PostgreSQL client TLS.** Configure it explicitly. Phase 12 must inspect the
   current psycopg and Django settings and select a supported client mode. At
   minimum the client must refuse plaintext, which `sslmode=prefer` does **not**
   do. Certificate and hostname verification is the target once the runtime
   trust-store design is verified.
3. **Confirm ARM accepts `roleAssignmentMode: 'LegacyRegistryPermissions'`** (an
   infrastructure check, not an application setting). Bicep types the property
   loosely (`null | string`) and neither `validate` (module short-circuited) nor
   what-if (no enum enforcement) proved ARM accepts the value. At the first real
   deployment, confirm the registry is created with `LegacyRegistryPermissions` and
   that the API identity can actually pull the image — a rejected or
   silently-defaulted value would break image pull.

`DJANGO_ALLOWED_HOSTS` is set to the app FQDN. Phase 12 should confirm the
Container Apps health-probe host behaviour against `ALLOWED_HOSTS` when the app is
first brought up.

### The watch list carried into the deployment sequence

Five items, all **open**, each with the gate that produces its evidence. See
[First Azure deployment](first-azure-deployment.md) for the gates themselves.

| # | Watch item | Evidence that would close it | Gate |
| - | ---------- | ---------------------------- | ---- |
| 1 | **AcrPull role assignment was never evaluated** by what-if (`Unsupported` / `WhatIfUnidentifiableResource`); its scope, role definition, and `principalType` are confirmed from the module only. | The assignment exists at registry scope after Deployment A **and** an image pull actually succeeds. | 3, 6 |
| 2 | **ARM acceptance of `roleAssignmentMode: 'LegacyRegistryPermissions'`** is unproven — Bicep types it loosely, so a rejected or silently-defaulted value would compile and preview cleanly. | The created registry reports `LegacyRegistryPermissions`. | 3 |
| 3 | **`SECURE_PROXY_SSL_HEADER`.** Now written as a literal in `core/settings/production.py` and covered by tests, but never exercised behind real Container Apps ingress. | `GET /api/v1/health/` over the ingress returns **200**, not 301, and a login sets a `Secure` cookie. | 6, 8 |
| 4 | **PostgreSQL client TLS.** `verify-full` plus the system CA bundle path is now configured, and the bundle was inspected by certificate content in the built image — but no handshake against a real Azure server has occurred, because the server does not exist until Deployment A. | The migration job connects and completes, and the readiness probe returns 200. | 5, 6 |
| 5 | **ARM acceptance of `azureADAuthenticationAsArmPolicy: 'enabled'`** (newly identified). It is a hard prerequisite for managed-identity image pull and is now declared in Bicep; the property is expressible at the pinned API version, but the enum value is typed loosely, so acceptance — including its **casing** — is unproven offline. | The created registry reports the policy enabled **and** the identity-based pull succeeds. | 3, 6 |

---

## Static Web Apps deployment boundary

`static-web-app.bicep` creates a **Free** Static Web App with no `repositoryUrl`,
`branch`, `repositoryToken`, `buildProperties`, custom domains, linked backends,
or managed functions. Source wiring and the React deployment are Phase 12 work.
The deployment token is never read or output.

---

## Cost assumptions and the cost-approval gate

Two contexts shape these figures: this is an **Azure free account** (12 months of
free service allowances remaining, being carried onto pay-as-you-go), and the
template's PostgreSQL shape was chosen to fit the free allowance exactly. All
prices are GBP; unit prices were retrieved from the Azure Retail Prices API on
**2026-07-24** for UK South (the Static Web App is Free, so West Europe adds
nothing). The subscription offer was confirmed at deployment as
`PayAsYouGo_2014-09-01` with the trial spending limit **off**. Everything here is
an **estimate with a calculation date, not a guarantee**.

**Free-account allowances relied on:**

* **PostgreSQL Flexible Server** — 750 hours of Burstable **B1MS**, **32 GB**
  storage, and **32 GB** backup storage per month, free for **12 months**.
  **Confirmed in the portal's Free Services view on 24 July 2026** (Flexible Server
  Burstable at 0 / 750 hours per month and Flexible Server Storage, Data Stored at
  0 / 32 GB per month). The template matches this exactly: `Standard_B1ms`, 32 GB,
  **autogrow disabled**, geo-redundant backup disabled, HA disabled. 750 hours
  covers a 24/7 server (~720 h/month). **Enabling storage autogrow would silently
  break free-tier eligibility** by letting storage grow past 32 GB — it is disabled
  deliberately.
* **Container Apps** — 180,000 vCPU-seconds, 360,000 GiB-seconds, and 2 million
  requests per month, **always free** (not tied to the 12-month window).
* **Log Analytics** — first 5 GB/month ingestion free; 31-day retention included.

**Unit prices for the lines that are still charged:**

* ACR **Basic** registry unit: £0.1262/day (£3.79/month). *(Basic is not a
  free-account service — see the SKU note below.)*
* PostgreSQL B1MS compute (after the allowance): £0.0144/hour (£10.37/month at
  24×30 h); storage £0.1008/GB/month (32 GB → £3.23); backup LRS £0.0758/GB/month
  above the free allowance.
* Log Analytics ingestion above 5 GB/month: £2.1819/GB.

**First 12 months (before VAT).** With the free allowances active, the **only
continuously charged line is Container Registry Basic at ≈ £3.79/month**.
PostgreSQL (within 750 h + 32 GB + 32 GB backup), Container Apps (within the
always-free grant), the Static Web App (Free), and Log Analytics (within 5
GB/month) contribute ≈ £0. Total ≈ **£3.79/month**, plus any Log Analytics
ingestion above 5 GB.

**After 12 months (before VAT).** When the 12-month PostgreSQL allowance lapses,
PostgreSQL becomes chargeable — compute £10.37 + storage £3.23 — on top of ACR
£3.79 ≈ **£17–18/month** (Container Apps stays always-free). This is the same
steady state as an ordinary pay-as-you-go subscription.

**What changes on expiry, and when.** The 12-month allowances expire **12 months
after the account creation date** — not per-resource, and not 12 months after each
resource is created. On that date the PostgreSQL compute and storage lines begin
billing; nothing about the template changes, only the allowance disappears.
Record the account creation date and treat month 13 as a step change from ≈ £3.79
to ≈ £17–18/month.

**Log Analytics worst case.** The 1 GB/day cap bounds ingestion to ≈ 30–31
GB/month. After the 5 GB free allowance that is ≈ 25–26 GB × £2.1819 ≈
**£55/month** worst case — the same in both periods, and far lower in normal
development. The cap is a guard, not an expectation.

**Largest continuously charged contributor:** first 12 months, Container Registry
Basic (the only charged line); afterwards, PostgreSQL.

**SKU choice recorded (option not taken).** The free account includes **one
Standard-tier** registry (100 GB) free for 12 months; **Basic is not on the free
list**. Standard would therefore be £0 for 12 months, then ≈ 4× Basic (Standard
£0.5050/day ≈ £15.15/month vs Basic £0.1262/day ≈ £3.79/month). Basic is retained
anyway: the month-13 cliff — jumping from £0 to ≈ £15/month — is a worse trap than
the ≈ £3.79/month Basic saving is a benefit, and Basic's limits (10 GB included
storage, one Django image) far exceed the need. The SKU is not changed.

**VAT.** UK VAT at 20% applies on top where the account is chargeable: first 12
months ≈ £4.55/month, afterwards ≈ £21/month (VAT applicability depends on the
offer/account).

**Cost-approval gate and budget alert.** No Bicep budget resource is created.
A **subscription budget with an alert is now strongly recommended, not optional**:
carrying the free account onto pay-as-you-go removes the trial spending limit, so
there is no automatic cap on a runaway cost (for example, Log Analytics ingestion
against the cap, or resources left running after month 12). Set one as a separate
operator action in Cost Management. Deployment cost approval remains a gate the
operator clears before Phase 12.

---

## Verification: offline build and connected validation

**Offline (performed in Phase 11, no Azure authentication required):**

```powershell
az bicep format --file infra/bicep/main.bicep
az bicep build  --file infra/bicep/main.bicep --outfile "$env:TEMP\quantora-main.json"
az bicep lint   --file infra/bicep/main.bicep
az bicep build-params --file infra/bicep/environments/development.bicepparam --outfile "$env:TEMP\quantora-params.json"
```

Compiled output is written to `$env:TEMP` — never into the repository — and
deleted after review. The build succeeds from a clean checkout with no Azure
authentication.

**Connected (operator action, once authenticated with a subscription):**

```powershell
az deployment sub validate `
  --location uksouth `
  --parameters infra/bicep/environments/development.bicepparam

az deployment sub what-if `
  --location uksouth `
  --parameters infra/bicep/environments/development.bicepparam `
  --result-format FullResourcePayloads
```

`az deployment sub validate` returned `"error": null` against this subscription on
**2026-07-24**, but it reported `NestedDeploymentShortCircuited` for **every**
module — meaning the nested module deployments were **not** actually validated.
This is expected ARM behaviour when module parameters are runtime-computed (as
here: each module's inputs derive from other modules' outputs), and it is exactly
why `ResourceGroupNotFound` did **not** occur — ARM never descended into the
modules to notice that the resource group does not yet exist. **Leaf-level
assurance therefore comes from the what-if previews below, not from validate.** On
some ARM backends validate instead returns `ResourceGroupNotFound` for a template
that creates its own resource group; Microsoft classifies that as working as
intended. Either way, do **not** alter the template to satisfy the tool (in
particular, never inject an unused module output as a parameter to force validation
to short-circuit); optionally re-run with `--validation-level Template` for
static-only checking.

### The three what-if previews and expected noise

Run three previews by toggling only the environment variables:

* **A — secure default:** `QUANTORA_DEPLOY_API_APP` and
  `QUANTORA_ALLOW_AZURE_SERVICES` unset.
* **B — conditional Django definition:** `QUANTORA_DEPLOY_API_APP=true`, a
  digest-pinned `QUANTORA_API_CONTAINER_IMAGE`, and a throwaway
  `QUANTORA_DJANGO_SECRET_KEY`. Verifies the resource **definition** only; it does
  not prove the image exists or can be pulled.
* **C — broad database access:** `QUANTORA_ALLOW_AZURE_SERVICES=true`.

Preview B should differ from A only by the Container App; Preview C should differ
from A only by the firewall rule. Every leaf resource must be change type
**Create**; any resource-level `Modify`, `Delete`, or `Ignore` stops approval.
All three previews were run on **2026-07-24** and matched this exactly: A showed
nine `Create` leaf resources, B added only the Container App, and C added only the
`0.0.0.0`–`0.0.0.0` firewall rule.

Expected, documented **noise** that is not a defect:

* Property-level `-` deletion markers inside a `Create` (properties defaulted
  during deployment are reported as deleted).
* Unevaluated expressions: what-if does not evaluate secure parameter values or
  resource functions such as `listKeys()` / `reference()`, so the PostgreSQL
  password, the Django secret, the Log Analytics shared key, and the ACR login
  server (on the Container App's registry entry) appear as raw expressions. This is
  correct and desirable.
* The AcrPull **role assignment** reports change type `Unsupported`
  ([WhatIfUnidentifiableResource](https://aka.ms/WhatIfUnidentifiableResource)) and
  what-if **did not evaluate it**: its name and scope derive from
  `guid(registry.id, principalId, roleDefinitionId)` over resource IDs and a module
  output that cannot be computed until the deployment is under way. Because what-if
  did not evaluate it, its scope (the registry), role definition (AcrPull), and
  `principalType` (`ServicePrincipal`) are **statically confirmed from the module
  only, not confirmed by ARM**. `Unsupported` is **not one of the seven documented
  what-if change types** (`Create`, `Delete`, `Ignore`, `NoChange`, `NoEffect`,
  `Modify`, `Deploy`) — it is the out-of-band signal that what-if could not analyse
  the resource, and it is not a stop-approval change type.

If the operator lacks role-assignment permission, add
`--validation-level ProviderNoRbac` to the what-if and validate commands.

---

## Deferred work

* **Phase 12:** image push, migration job, Django Container App deployment, React
  deployment, database-access opening, cross-origin / TLS / proxy-header settings.
* **Phase 41 / Phase 43:** identities and infrastructure for the market-data
  service, risk-engine service, Celery worker, Celery Beat, the Static Web App,
  and deployment automation.
* **Phase 45 / Phase 46:** later observability and operational hardening (alerts,
  action groups, dashboards, diagnostic settings, saved queries — none created
  here).

---

## The no-deployment stopping point

Phase 11 stops at defined-and-verified infrastructure. No Azure resource is
created, no resource group exists, no image is pushed, no migration is run, and no
artifact is deployed. Deployment approval has not been requested. The operator
reviews this document and the Bicep, then performs the provider preflight, the
connected validation and what-if previews, and — only after approval — the Phase
12 cutover.
