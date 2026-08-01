# First Azure deployment (Phase 12 vertical slice)

This document is the operator runbook for Quantora's **first real Azure
deployment**. [Azure foundation](azure-foundation.md) describes the
infrastructure *definition*; this document describes bringing it up, pushing an
image, migrating the database, deploying the Django API and the React bundle,
and verifying the result in a browser.

> **Repository enablement is complete; no Azure resource exists yet.** Everything
> in this repository is source. Nothing here has provisioned, pushed, migrated,
> or deployed anything. Every mutating action below is an explicit operator step
> behind a named gate.

Placeholders written as `<…>` are filled in by the operator during the run. Some
sections are marked **PLACEHOLDER — filled during the run**; those record facts
that do not exist until the deployment happens.

---

## 1. Scope, and the Phase 11 → Phase 12 boundary

**Phase 11 delivered** the Bicep source: one subscription-scoped root, seven
modules, one linter configuration, one development parameter file, and offline
verification. It created nothing.

**Phase 12, part 1 (repository enablement — merged before this runbook is used)**
delivered:

* `SECURE_PROXY_SSL_HEADER` in the production settings module, plus the required
  `POSTGRES_SSLMODE` / conditional `POSTGRES_SSLROOTCERT` client-TLS contract and
  the tests that pin both.
* An eighth Bicep module, `container-app-job-migrate.bicep`, gated on a new
  `deployMigrationJob` flag.
* The shared runtime values (`djangoCookieSameSite`, `postgresSslMode`,
  `postgresSslRootCert`) as root parameters passed to both consumers.
* `azureADAuthenticationAsArmPolicy` declared explicitly on the registry.
* `apps/web/public/staticwebapp.config.json`.
* This document.

**Phase 12, part 2 (this runbook)** performs the deployment: provider preflight,
three deployments, an image push, a manual migration job, the Django Container
App, the React artifact upload, and browser verification.

**Explicitly still deferred.** HSTS (Phase 12 sets no `SECURE_HSTS_*`).
Application Insights instrumentation and OpenTelemetry wiring (Phase 45). Private
networking, VNet integration, and private endpoints (Phase 41). A least-privilege
application database role. Key Vault. CI-driven deployment — GitHub Actions
deploys nothing.

---

## 2. The three deployment states

The template is driven by three booleans and one image reference. Deployments run
in this order; each is a full `az deployment sub create` against the same
parameter file, differing only in the `QUANTORA_*` environment variables set in
the operator's shell.

| | `deployMigrationJob` | `deployApiApp` | `allowAzureServices` | `apiContainerImage` |
| --- | --- | --- | --- | --- |
| **A — foundation** | `false` | `false` | `false` | *(empty)* |
| **B — migration** | `true` | `false` | `true` | digest reference |
| **C — application** | `true` | `true` | `true` | *same* digest reference |

Deployment A is also the committed default state: with **no** `QUANTORA_*`
variables set at all, `development.bicepparam` resolves to exactly row A. That is
verified offline (see §12).

**Expected resources.**

* **A** creates nine leaf resources: resource group, Log Analytics workspace,
  Application Insights, managed identity, container registry, the AcrPull role
  assignment, Container Apps environment, PostgreSQL flexible server, the
  `quantora` database, and the Static Web App. No firewall rule, no Container
  App, no job.
* **B** adds the `0.0.0.0`–`0.0.0.0` firewall rule and the migration job
  `caj-quantora-migrate-dev-uks`. It does **not** add the Django Container App.
* **C** adds the Django Container App `ca-quantora-api-dev-uks`. Everything from
  B stays.

Deployment C is run **only after the migration job has completed successfully**.
Deploying Django against an unmigrated database produces an app that starts,
fails readiness, and serves 503s.

**Why the image reference is unconstrained at the root.** `apiContainerImage`
keeps an empty default and carries no length constraint, because Deployment A
must validate with no image. The `@minLength(1)` constraint sits on the *module*
parameters in `container-app-api.bicep` and `container-app-job-migrate.bicep`
instead: a module's parameter constraints are evaluated only when the module is
instantiated, so the image becomes required exactly when its flag is true, and
ARM reports an error naming the parameter. Both modules receive the **same**
value; neither composes a tag internally.

---

## 3. The eight operator gates

| # | Gate | Mutates Azure? |
| - | ---- | -------------- |
| 1 | **Provider preflight** — confirm the seven namespaces are `Registered`; register any that are not. | Read-only, **except** `az provider register`, which is a subscription mutation. |
| 2 | **Cost approval** — re-read §11 of [azure-foundation.md](azure-foundation.md), confirm the figures against a current retrieval date, and set a subscription budget alert. | No (the budget alert is a separate Cost Management action). |
| 3 | **Deployment A** — `az deployment sub what-if`, review, then `create`. | **Yes** — creates the foundation. |
| 4 | **Image push** — build `linux/amd64` with `--build-arg APP_REVISION=<full commit sha>` and `--build-arg APP_VERSION=<short sha>`, which feed the existing `org.opencontainers.image.revision` and `.version` labels (both `ARG`s are already in `services/api/Dockerfile`, so this needs **no** Dockerfile change); tag, `az acr login`, push, record the digest, then verify the resulting labels on the pushed image with `docker image inspect --format "{{json .Config.Labels}}"`. | **Yes** — writes to the registry. |
| 5 | **Deployment B + migration run** — deploy the job, start it once, read logs and exit status. | **Yes** — opens the firewall, creates and runs the job. |
| 6 | **Deployment C** — deploy the Django Container App, confirm image pull and readiness, and check the probe log status codes (see below). | **Yes** — creates the app. |
| 7 | **Static Web Apps upload** — retrieve the deployment token, upload `dist`. | **Yes** — publishes the frontend. |
| 8 | **Browser verification and sign-off** — the §12 checklist, then either accept or roll back. | No (verification only). |

### Gate 6: the probe headers, and the 301 trap

All three probes must send **two** `httpHeaders`, and the template sets them:

* **`Host`**, taken from the same variable that feeds `DJANGO_ALLOWED_HOSTS`.
  Probes arrive over loopback, so their `Host` is the local address. Django's
  `CommonMiddleware.process_request` calls `request.get_host()` unconditionally
  to evaluate `PREPEND_WWW`, so `ALLOWED_HOSTS` is validated on **every**
  request — a foreign `Host` yields `DisallowedHost` and a **400**, and the
  revision never activates.
* **`X-Forwarded-Proto: https`**, because a loopback request is otherwise not
  secure and `SECURE_SSL_REDIRECT` answers **301**.

**The trap: Container Apps counts any status from 200 to 399 as a passing
probe.** Setting only the `Host` header therefore produces a revision that goes
`Healthy` while every probe is being answered with a 301 and the readiness view
is never executed — readiness would report ready even with PostgreSQL
unreachable. A green revision is not evidence on its own.

**So verify the probe status codes, not just the revision state.** Read the
container console log and confirm Gunicorn logged **200** for the probe requests
from `127.0.0.1` on both `/api/v1/health/` and `/api/v1/health/ready/`. A 301
means the fix is incomplete; a 400 means the `Host` header is not being honoured.

Gates 1 and 2 are read-only reviews. Gates 3–7 mutate Azure. Gate 8 is
verification. No gate may be skipped, and no gate may be run out of order.

---

## 4. Secret handling

Four `QUANTORA_*` environment variables drive the parameter file. **By name
only:**

| Variable | Secret? | Purpose |
| -------- | ------- | ------- |
| `QUANTORA_PG_ADMIN_PASSWORD` | **yes** | PostgreSQL administrator password. Required; no default. |
| `QUANTORA_DJANGO_SECRET_KEY` | **yes** | Django `SECRET_KEY`. Empty default so Deployment A validates without one. |
| `QUANTORA_API_CONTAINER_IMAGE` | no | The one complete digest-pinned image reference. |
| `QUANTORA_DEPLOY_API_APP` / `QUANTORA_DEPLOY_MIGRATION_JOB` / `QUANTORA_ALLOW_AZURE_SERVICES` | no | The three flags. |

**Generation.** Generate both secrets locally with a cryptographic RNG — for the
Django key, `python -c "import secrets; print(secrets.token_urlsafe(64))"`; for
the database password, an equivalent of at least 32 characters meeting the Azure
Database for PostgreSQL complexity rules. Never reuse a value from another
environment, never derive one from a name or a date, and never reuse the local
development password.

**Process-only lifetime.** Set them with `$env:NAME = …` in the deploying
PowerShell session only. They must not be written to `.env`, to a `.ps1`, to a
parameter file, to shell history as a literal, or to any file in the repository.

**Clearing.** At the end of the run:

```powershell
Remove-Item Env:\QUANTORA_PG_ADMIN_PASSWORD, Env:\QUANTORA_DJANGO_SECRET_KEY -ErrorAction SilentlyContinue
Clear-History
```

Then close the session.

**The hard rule.** No secret may appear in a command argument, a file, command
output, a log, a screenshot, or this document. That is why the parameter file
reads the environment rather than accepting `--parameters key=value` overrides,
why both secrets are `@secure()` end to end through both modules, why they reach
the containers as Container App / job **secrets** referenced by `secretRef`, and
why **no template output carries a secret**. If a value is ever printed by
accident, rotate it rather than assuming it was unseen.

---

## 5. The PostgreSQL Azure-services firewall exception

Deployments B and C set `allowAzureServices=true`, which adds a single firewall
rule with start and end address `0.0.0.0`.

**What it permits.** This is Azure's "allow access from Azure services" special
case. It permits connection attempts from Azure services in **any tenant** — not
only this subscription, and not only this resource group. It is not private, not
subscription-scoped, not Container-Apps-only, and not secure by itself. Anything
running on Azure anywhere can reach the server's TCP endpoint.

**Why it is needed anyway.** Container Apps Consumption workloads have no stable
outbound IP to allow-list, and the alternative — VNet integration with a private
endpoint — is Phase 41 work.

**Compensating controls, all already in place:**

* Authentication still applies: the connection needs the administrator login and
  password, which are never emitted.
* `POSTGRES_SSLMODE=verify-full` means the client validates the server chain
  **and** the hostname, so the connection cannot be silently intercepted.
* The server carries development data only.
* Public network access is enabled but the rule is the *only* rule; there is no
  broad address range beyond the Azure-services special case.

**Removal condition.** Phase 41 introduces private networking. When the API
reaches PostgreSQL over a private endpoint, this rule is deleted and
`allowAzureServices` returns to `false` permanently. Until then it is enabled
deliberately, at Gate 5, and recorded here.

---

## 6. The migration job

`caj-quantora-migrate-dev-uks` is a `Microsoft.App/jobs` resource with
`triggerType: 'Manual'`.

**Why manual.** Migrations are never run during image build, during Bicep
deployment, at application startup, or from a container entrypoint. A schema
change is an operator decision with a review point before and after it, so the
job is started by hand and its result is read by hand. There is no schedule
trigger and no event trigger.

**Why `replicaRetryLimit: 0`.** A failed migration must stay failed. An automatic
retry would re-run `migrate` against a database in an unknown intermediate state
and would bury the original error under a second, less informative one.

**Why `parallelism: 1` and `replicaCompletionCount: 1`.** Exactly one replica
runs `manage.py migrate`. Two concurrent migration processes against one database
is never wanted; Django's migration locking is not a substitute for simply not
doing it.

`replicaTimeout` is 600 seconds — far beyond what this migration set needs, and
still a bound on a job hanging against an unreachable database.

**Starting it.**

```powershell
az containerapp job start `
  --name caj-quantora-migrate-dev-uks `
  --resource-group rg-quantora-dev-uks
```

**Reading logs and exit status.**

```powershell
az containerapp job execution list `
  --name caj-quantora-migrate-dev-uks `
  --resource-group rg-quantora-dev-uks `
  --output table

az containerapp job logs show `
  --name caj-quantora-migrate-dev-uks `
  --resource-group rg-quantora-dev-uks `
  --container quantora-migrate `
  --job-execution-name <execution-name>
```

The execution status must be `Succeeded`. `Running` means wait; `Failed` means
stop.

**Why Django is not deployed after a failed migration.** Deployment C is gated on
a successful execution. An app deployed against a partially migrated schema
starts, passes its startup and liveness probes (both database-independent), and
then fails readiness or raises `ProgrammingError` on the first real query — a
failure that looks like an application bug rather than a migration that did not
finish. Fix the migration, re-run the job, and only then run Deployment C.

`az containerapp exec` is not used for migrations: at migration time the app does
not exist yet.

---

## 7. Proxy-aware HTTPS

Container Apps HTTP ingress terminates TLS at the environment edge and forwards
plain HTTP to the container, adding an `X-Forwarded-Proto` header that records
the protocol the *client* used. Crucially, the ingress **overwrites** that header
if a caller supplies its own, so the value the container sees is set by the
platform and is not spoofable. That overwrite guarantee is exactly the
precondition Django requires before the header may be trusted.

The setting, in `core/settings/production.py`:

```python
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
```

It is a **literal**, not environment-driven: a configurable header name would let
a future misconfiguration trust an arbitrary, caller-controlled header.
`SECURE_SSL_REDIRECT` is unchanged and still defaults to `True`. No `SECURE_HSTS_*`
setting is added.

**The redirect-loop failure signature**, if this were ever unset: every request
returns **301** to the same HTTPS URL, the browser reports `ERR_TOO_MANY_REDIRECTS`,
and — the dangerous part — **all three probes report the app healthy**, because
Container Apps treats any status from 200 to 399 as probe success. A healthy app
that answers nothing is the signature. `curl -i https://<api-fqdn>/api/v1/health/`
returning `301` instead of `200` is the one-line diagnosis.

Regression coverage lives in `services/api/tests/test_production_settings.py`,
including a control asserting that the same client *does* 301 without the header,
so the passing case cannot be vacuous.

---

## 8. PostgreSQL client TLS

Azure Database for PostgreSQL requires TLS. The deployed value is
`POSTGRES_SSLMODE=verify-full`, which validates the server certificate chain
**and** the hostname — `require` proves only that TLS happened, and `verify-ca`
does not bind the certificate to the host being connected to.

`POSTGRES_SSLROOTCERT=/etc/ssl/certs/ca-certificates.crt` is the Debian system CA
bundle inside the image. It is **required** whenever the mode is `verify-ca` or
`verify-full`: without it libpq falls back to `~/.postgresql/root.crt`, which does
not exist for the non-root UID 10001 runtime user, and the resulting error reads
like a missing certificate authority rather than a missing path.

`POSTGRES_SSLMODE` is required with **no default** in the settings module, for the
same reason `DJANGO_ALLOWED_HOSTS` is: a default is a value that could silently
reach Azure if the variable were ever dropped.

**Roots the bundle must anchor.** Azure Database for PostgreSQL currently
presents chains rooted at DigiCert and Microsoft roots. The image's bundle was
inspected by certificate content (not filename) during enablement:

**PLACEHOLDER — filled during the run.** Re-inspect at deployment time and record,
for each root, presence, SHA-256 fingerprint, issuer common name, and expiry.
Cross-check the fingerprints against Microsoft's current published root list
rather than against any value copied into this document — Microsoft has published
different SHA-256 values under confusingly similar friendly names (RSA, ECC, EV
RSA, EV ECC 2017).

| Root | Present | SHA-256 | Not after |
| ---- | ------- | ------- | --------- |
| DigiCert Global Root CA | `<…>` | `<…>` | `<…>` |
| DigiCert Global Root G2 | `<…>` | `<…>` | `<…>` |
| Microsoft RSA Root Certificate Authority 2017 | `<…>` | `<…>` | `<…>` |
| Microsoft ECC Root Certificate Authority 2017 | `<…>` | `<…>` | `<…>` |

**The `sslrootcert` failure signature.** A migration job or app replica that fails
with `root certificate file "/root/.postgresql/root.crt" does not exist` means the
path variable did not reach the container. A failure reading
`SSL error: certificate verify failed` or `self-signed certificate in certificate
chain` means the bundle is present but does not anchor the presented chain — that
is a trust-store problem, **not** a reason to weaken the mode to `require`.

Locally the production-check topology sets `POSTGRES_SSLMODE=disable`, because the
official `postgres` image it runs does not serve TLS at all. That value lives in
the tracked `docker-compose.production-check.yml`, never in a personal `.env`.

---

## 9. Cross-origin sessions

The SPA is served from the Static Web App hostname; the API answers on the
Container Apps hostname. Those are **different registrable domains**, so the
browser classifies every API call as **cross-site**, not merely cross-origin.

Consequences, all already configured:

* Session and CSRF cookies must be `SameSite=None; Secure`, otherwise the browser
  never sends them on the cross-site request. `djangoCookieSameSite` is `'None'`,
  and the settings module's `enforce_samesite_secure_invariant` refuses `None`
  unless both cookies are already `Secure` — which they are in production.
* `DJANGO_CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS` both receive the
  single exact frontend origin, derived in `main.bicep` from the Static Web App's
  default hostname. No wildcard is ever combined with credentials.
* The frontend must be built with `VITE_API_BASE_URL` pointing at the absolute API
  base (see §10).

**Exact origin values — PLACEHOLDER, filled during the run:**

* Frontend origin: `https://<static-web-app-default-hostname>`
* API origin: `https://<container-app-fqdn>`

### Telling the three failure modes apart

| Symptom | Cause | Where to look |
| ------- | ----- | ------------- |
| Browser console: *"blocked by CORS policy … No 'Access-Control-Allow-Origin' header"*; the request never reaches the app logic | **CORS** — the origin is not in `DJANGO_CORS_ALLOWED_ORIGINS`, or the value did not reach the container | Compare the browser's `Origin` header against the deployed variable, character for character including scheme and any port |
| HTTP **403** with a JSON body from the CSRF failure view; the request *did* reach Django | **CSRF** — the origin is not in `DJANGO_CSRF_TRUSTED_ORIGINS`, or the `X-CSRFToken` header is missing | Django logs; check the SPA sent the header on the unsafe method |
| Request succeeds but arrives **unauthenticated** (401), and the browser shows no `sessionid` cookie being sent | **Browser cookie policy** — the cookie was not stored or not sent because it lacks `SameSite=None; Secure`, or third-party cookie blocking is on | DevTools → Application → Cookies, and the Network tab's request cookie list |

A CORS failure is blocked *before* Django; a CSRF failure is a Django 403; a
cookie-policy block is a successful request with no credential attached. Do not
"fix" a cookie-policy block by loosening CORS.

---

## 10. Static Web Apps

**Routing contract** (`apps/web/public/staticwebapp.config.json`, copied by Vite
to the root of `dist`, which is where Static Web Apps requires it when there is a
build step):

* `globalHeaders` sets `Cache-Control: no-cache`, `X-Content-Type-Options:
  nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.
* Cache control is **global**, not a route rule on `/index.html`, because route
  rules are **not applied to requests handled by `navigationFallback`** — a rule
  scoped to `/index.html` would never reach a deep-link response.
* A route rule on `/assets/*` overrides the global header with `public,
  max-age=31536000, immutable`. Route headers win over global headers of the same
  name, which is what gives the content-hashed bundles their immutable policy.
* `navigationFallback` rewrites to `/index.html` and **excludes** `/assets/*` (so
  a missing script returns a real 404 rather than an HTML document a `<script>`
  tag would try to parse), `/api/*` (so an accidental root-relative API call gets
  a real non-SPA 404 instead of `index.html` with status 200), and a list of
  common static file extensions.

There is **no** `auth` section, no `allowedRoles`, no `responseOverrides`, no
`platform`, no `networking`, and no linked backend. Static Web Apps performs no
proxying here and never reaches Django. **Django remains the sole authentication
authority.**

The same SPA-fallback intent exists in two places now — `apps/web/nginx/default.conf`
for local verification, and this file for Azure. They are separate
implementations of one contract; changing one means checking the other.

**Frontend build contract.** `VITE_API_BASE_URL` is **optional** and defaults to
`/api/v1`. It accepts either a root-relative path with a single leading slash, or
a full `http`/`https` URL; a protocol-relative `//host` value and any other scheme
are rejected at import time. A trailing slash is **not** required — the request
builder strips trailing slashes from the base, appends exactly one, and resolves
the path against it with leading slashes stripped. For Azure the frontend is built
with the absolute API base:

```powershell
$env:VITE_API_BASE_URL = "https://<container-app-fqdn>/api/v1"
pnpm --filter quantora-web build
```

**Token flow.** The deployment token is retrieved at Gate 7, used once by the CLI
in that session, and never written to a file, a workflow, or this document. The
Bicep template never reads or outputs it.

**PLACEHOLDER — filled during the run:** the exact
`@azure/static-web-apps-cli` (`swa`) version actually used, and the exact upload
command.

---

## 11. Browser support

Verification is performed in the **approved Chrome environment** only — the same
browser used for every previous phase's walkthrough.

Recorded without overstating: the application is verified to work in that one
browser at that one version. Nothing here establishes support for Firefox,
Safari, Edge, or any mobile browser, and cross-site credentialed cookies are
exactly the area where those browsers differ most (Safari's ITP and Firefox's
Total Cookie Protection both restrict third-party cookies by default). A
successful Chrome walkthrough is evidence for Chrome, not a compatibility claim.

**PLACEHOLDER — filled during the run:** exact Chrome version, operating system,
and whether third-party cookie blocking was on or off during the walkthrough.

---

## 12. Rollback, cost stop, cleanup, and the verification checklist

### Verification checklist (Gate 8)

1. `GET https://<api-fqdn>/api/v1/health/` returns **200**, not 301.
2. `GET https://<api-fqdn>/api/v1/health/ready/` returns **200** (proves TLS to
   PostgreSQL and the applied migrations).
3. The frontend loads at `https://<static-web-app-hostname>` and a deep link
   (e.g. `/portfolios`) reloads correctly rather than 404-ing.
4. A hashed asset under `/assets/` is served with `Cache-Control: …immutable`;
   `index.html` is served `no-cache`.
5. `GET /api/nonexistent` on the frontend host returns a real 404, **not**
   `index.html` with status 200.
6. Register, log in, create a portfolio, reload, log out — the full session flow,
   with the `sessionid` cookie visible as `Secure; SameSite=None`.
7. Anonymous `GET /api/v1/auth/me/` returns 401.
8. No secret, token, or connection string appears in any deployment output.

### Rollback

* **Application only:** redeploy with `QUANTORA_DEPLOY_API_APP=false`. The
  Container App is removed; data, registry, and infrastructure remain.
* **Migration:** there is no automatic down-migration. Reverting a schema change
  means a new forward migration, or restoring from the server's 7-day backup
  retention.
* **Frontend:** re-upload the previous `dist`. Static Web Apps keeps no automatic
  history here.

### Cost stop

The continuously charged line during the free-allowance window is the Container
Registry Basic unit. Container Apps scales to `minReplicas: 0`. To stop cost
entirely, delete the resource group:

```powershell
az group delete --name rg-quantora-dev-uks --yes
```

That is irreversible and destroys the database. Confirm the backup posture first.

**PLACEHOLDER — filled during the run:** cost figures re-retrieved at deployment
time, with the retrieval date. Do not carry forward the figures in
[azure-foundation.md](azure-foundation.md) without re-checking them.

### Cleanup

Clear the `QUANTORA_*` environment variables (§4), delete any compiled ARM JSON
from `$env:TEMP`, and confirm `git status` is clean.

---

## 13. The Phase 12 stopping point

Phase 12 ends with one development environment running one Django API, one React
frontend, one PostgreSQL server, and one migration job that has run once.

It does **not** deliver: a staging or production environment, a custom domain, a
CDN, private networking, autoscaling beyond `maxReplicas: 1`, alerts, dashboards,
diagnostic settings, CI-driven deployment, Key Vault, Redis, Celery, the
market-data service, or the risk-engine service. Each belongs to its own later
phase.

**Never recorded in this document:** a subscription ID, a tenant ID, any secret
value, the Static Web Apps deployment token, or the PostgreSQL server's unique
name suffix.

---

**PLACEHOLDER — filled during the run:** deployment dates, the resolved hostnames,
the image digest, the CLI versions used, and the verification results.
