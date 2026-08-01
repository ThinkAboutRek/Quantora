# Production container images

This document describes the **image artifacts** Quantora builds for deployment:
the Django API image and the React static bundle. It covers the multi-stage
builds, every pinned base image, the runtime environment contract, and the local
verification harness used to smoke-test the images before any registry or cloud
phase exists.

> **Artifact, not deployment.** Phase 10 produces images and proves they run
> correctly on a local machine. It creates no registry, touches no cloud, and
> starts no later phase. The locked production destinations — recorded here for
> context only — are: the **React `dist` bundle → Azure Static Web Apps**, and
> the **Django image → Azure Container Registry and Azure Container Apps**. Those
> are later phases. Nothing in this repository deploys anything.

---

## 1. The two artifacts

| Artifact          | Built from            | Runtime                    | Production destination (later phase) |
| ----------------- | --------------------- | -------------------------- | ------------------------------------ |
| Django API image  | `services/api/Dockerfile` target `production`   | Gunicorn (WSGI), non-root | Azure Container Registry → Azure Container Apps |
| React SPA bundle  | `apps/web/Dockerfile` target `artifact`         | *(static files, no server)* | Azure Static Web Apps |

The repository also builds an **unprivileged NGINX image**
(`apps/web/Dockerfile` target `static-runtime`). That image exists **only** to
verify the static build, the SPA fallback, the cache headers, and the browser
flow locally. **It is not deployed** — in production the `dist` bundle is
uploaded to Azure Static Web Apps, which provides its own edge serving.

---

## 2. Stage maps

### API — `services/api/Dockerfile`

Build context is the **repository root** (the Django service is a uv workspace
member and resolves from the root lockfile).

```
base ─────────► development        (Phase 5, unchanged; dev workspace venv)
python-builder ─► static-builder ─► production
```

| Stage            | FROM                                   | Purpose |
| ---------------- | -------------------------------------- | ------- |
| `base`           | `python:3.13.14-slim-bookworm` (tag only) | Full workspace venv (`uv sync --all-packages`); dev dependencies included. |
| `development`    | `base`                                 | The Compose development target. No CMD (Compose supplies `runserver`). |
| `python-builder` | pinned `python:3.13.14-slim-bookworm@sha256:…` | Clean, **API-scoped** production venv (`uv sync --package quantora-api --frozen --no-dev --no-editable`). Deliberately **not** `FROM base`, so no dev/test packages and no sibling-service dependencies leak in. |
| `static-builder` | `python-builder`                       | Flattens to the runtime layout (`/app/src`, `/app/manage.py`), runs `collectstatic` with the real production settings and inline non-secret placeholders, and precompiles bytecode (`compileall`). |
| `production`     | pinned `python:3.13.14-slim-bookworm@sha256:…` | The deployable runtime. Narrow root-owned copies of `.venv`, `src`, `manage.py`, `staticfiles`; non-root `app` user (UID/GID 10001); Gunicorn CMD. |

Why `python-builder` starts from the pinned Python base rather than `base`: the
`base` stage runs `uv sync --all-packages`, which installs the dev dependency
group (ruff, mypy, pytest, stubs) **and** every sibling service's dependencies. A
production API image must carry none of that, so the production builder starts
clean and installs only the `quantora-api` dependency closure.

### Frontend — `apps/web/Dockerfile`

Build context is `apps/web`.

```
base ──► development               (Phase 5, unchanged; frozen pnpm install)
base ──► build ──► artifact         (export-only dist carrier)
              └──► static-runtime   (local verification server)
```

| Stage            | FROM                                | Purpose |
| ---------------- | ----------------------------------- | ------- |
| `base`           | `node:24.18.0-bookworm-slim` (tag only) | `pnpm install --frozen-lockfile` under the Corepack pin. |
| `development`    | `base`                              | The Compose development target. No CMD (Compose supplies `vite`). |
| `build`          | `base`                              | `tsc -b && vite build`; `VITE_API_BASE_URL=/api/v1` for the build only. |
| `artifact`       | `scratch`                           | Export-only carrier: `dist/` copied to `/`. Not runnable. |
| `static-runtime` | pinned `nginxinc/nginx-unprivileged:1.30.4-alpine3.24@sha256:…` | Unprivileged NGINX serving the bundle for **local verification only**. |

No new Node `FROM` is introduced for the production frontend stages: `build`
inherits the existing Phase 5 `base` stage.

---

## 3. Image and dependency pins

Every **newly added** production `FROM`/cross-image `COPY` is pinned as
`readable-tag@sha256:INDEX-digest`. The index digest (the multi-platform image
index / manifest-list digest) is what is pinned — **not** a per-platform manifest
digest. Development stages keep their Phase 5 **tag-only** pins.

| Image                                  | Readable tag              | Index digest (pinned)                                                     |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| `python` (production stages)           | `3.13.14-slim-bookworm`   | `sha256:9d7f287598e1a5a978c015ee176d8216435aaf335ed69ac3c38dd1bbb10e8d64` |
| `ghcr.io/astral-sh/uv` (builder COPY)  | `0.11.28`                 | `sha256:0f36cb9361a3346885ca3677e3767016687b5a170c1a6b88465ec14aefec90aa` |
| `nginxinc/nginx-unprivileged` (web)    | `1.30.4-alpine3.24`       | `sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49` |

For reference, the observed **linux/amd64 manifest digests** (NOT used as pins)
were: python `sha256:dd86541a59b252667f4c12f8b2ee17216de37dd65ac773bf097bef996fa78860`,
uv `sha256:5c3ab83183a73c5d319a77009eb425b60d5bb937f339fb7876788ebf567baf48`,
nginx `sha256:bc69cfff69f75aef06daeda8dea70de95fa9ad97a03fe134cd4e5e6789d51124`.

Python production dependencies added in Phase 10 (into
`services/api/pyproject.toml`, resolved into the single root `uv.lock`):

| Package     | Constraint        | Resolved version |
| ----------- | ----------------- | ---------------- |
| `gunicorn`  | `>=26.0,<27`      | `26.0.0`         |
| `whitenoise`| `>=6.12,<7`       | `6.12.0`         |

### Updating a digest

1. Resolve the new index digest live:
   `docker buildx imagetools inspect <repository>:<tag>` — the top-level
   `Digest:` line is the index digest. **Do not** use a per-platform entry under
   `Manifests:`.
2. Replace the `@sha256:…` in the Dockerfile(s), keeping the readable tag next to
   it so the pin stays human-auditable.
3. Update the table above.
4. Rebuild `--no-cache` and re-run the smoke checks in §9.

> **Development vs production pinning.** Development stages are pinned by tag
> only; production stages are pinned by tag **plus** index digest. After an
> upstream rebuild republishes the same tag against a new digest, the two may
> reference **different underlying images** until the production digest is
> refreshed. That divergence is expected and intentional: development follows the
> tag; production stays byte-reproducible until a digest is deliberately bumped.

---

## 4. API runtime environment contract

The production image bakes **no** secrets and **no** database values. Every
variable below is supplied at runtime.

| Variable                     | Required? | Secret? | Notes |
| ---------------------------- | --------- | ------- | ----- |
| `DJANGO_SETTINGS_MODULE`     | yes       | no      | `core.settings.production` in production. |
| `DJANGO_SECRET_KEY`          | yes       | **yes** | No default; startup fails if unset. |
| `DJANGO_ALLOWED_HOSTS`       | yes       | no      | Comma-separated; no baked default. |
| `POSTGRES_DB`                | yes       | no      | Same names development already uses. |
| `POSTGRES_USER`              | yes       | no      | |
| `POSTGRES_PASSWORD`          | yes       | **yes** | |
| `POSTGRES_HOST`              | yes       | no      | |
| `POSTGRES_PORT`              | yes       | no      | |
| `POSTGRES_CONNECT_TIMEOUT`   | no        | no      | Bounded positive int; default `3`; **rejected below 2** (libpq does not usefully honour smaller). Operational config, not a secret. |
| `POSTGRES_SSLMODE`           | **yes**   | no      | libpq client TLS mode; one of `disable`, `allow`, `prefer`, `require`, `verify-ca`, `verify-full`. **No default** — see §4.2. Also required by the `collectstatic` build step, which sets `disable` inline because it opens no connection. |
| `POSTGRES_SSLROOTCERT`       | conditional | no    | Certificate authority bundle **path**. Required when `POSTGRES_SSLMODE` is `verify-ca` or `verify-full`; ignored (and not passed to libpq) otherwise. |
| `WEB_CONCURRENCY`            | no        | no      | Gunicorn's documented worker-count source; image default `2`, overridable. The Azure Container App sets it explicitly (also `2`), and a Container App environment variable overrides the image `ENV`. |
| `DJANGO_COOKIE_SAMESITE`     | no        | no      | Existing cookie contract; unchanged in Phase 10. |
| `DJANGO_CSRF_TRUSTED_ORIGINS`| no        | no      | Existing; environment-driven, no baked domains. |
| `DJANGO_CORS_ALLOWED_ORIGINS`| no        | no      | Existing; environment-driven, no baked domains. |
| `DJANGO_SECURE_SSL_REDIRECT` | no        | no      | Defaults to `True`. Set to `false` **only** in `docker-compose.production-check.yml`, because that topology has no TLS terminator; real deployments keep the default. See §4.1. |

Baked image `ENV` (non-secret, operational only): `PATH` (venv first),
`PYTHONPATH=/app/src`, `PYTHONDONTWRITEBYTECODE=1`, `PYTHONUNBUFFERED=1`,
`WEB_CONCURRENCY=2`.

### 4.1 The Phase 12 TLS obligation (why the redirect is env-overridable)

In production the image runs behind [Azure Container Apps ingress][aca-ingress].
The ingress proxy **terminates TLS at the environment's edge** and forwards the
request to the container over the internal network, adding an `X-Forwarded-Proto`
header that records the protocol the *client* actually used. Crucially, Container
Apps **overwrites** `X-Forwarded-Proto` if a client tries to supply its own — so
the header the container receives is set by the platform, not spoofable by the
caller. That overwrite is precisely the precondition Django requires before
`SECURE_PROXY_SSL_HEADER` may be trusted, and it is satisfied here.

Container Apps also **already redirects HTTP → HTTPS by default** at the edge;
that redirect is only disabled by explicitly allowing insecure traffic on the
ingress. So the edge, not Django, owns the redirect.

**Therefore the Phase 12 obligation is `SECURE_PROXY_SSL_HEADER`, not the
redirect.** Without it, Django terminates the request believing every forwarded
call is plain HTTP, which breaks Secure cookies, the CSRF origin check, and
absolute-URI building — and, if `SECURE_SSL_REDIRECT` were left on, would produce
an **infinite redirect loop** (Django keeps 301-ing a request the edge already
delivered over HTTPS). This is exactly why `SECURE_SSL_REDIRECT` is
env-overridable now rather than hard-coded: the local production-check topology
has no edge proxy, and the eventual production posture defers the redirect to the
ingress.

**Recommended Phase 12 position:** rely on the Container Apps ingress for the
HTTP → HTTPS redirect and set `SECURE_PROXY_SSL_HEADER =
("HTTP_X_FORWARDED_PROTO", "https")` in Django. Leaving `SECURE_SSL_REDIRECT` on
in Django as well is a valid but **redundant** belt-and-braces alternative.

> **Taken.** The production settings module now sets exactly that header as a
> literal, and `SECURE_SSL_REDIRECT` is unchanged — the belt-and-braces variant.
> The header name is deliberately **not** environment-driven, so no
> misconfiguration can point it at a caller-controlled header.

One caution for that phase: `X-Forwarded-Proto` must **not** be trusted on any
path that is not the external edge ingress. Internal Container Apps traffic has
been observed to carry `https` on plain-HTTP internal (app-to-app) calls, so
trusting the header on internal routes would misreport the scheme.

[aca-ingress]: https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview

### 4.2 PostgreSQL client TLS, and why the local value is `disable`

`POSTGRES_SSLMODE` is **required with no default**. That is deliberate: a default
would be a value that could silently reach a real deployment if the variable were
ever dropped, which is the same reasoning that makes `DJANGO_ALLOWED_HOSTS` fail
loudly. Azure uses `verify-full` — chain **and** hostname verification — with
`POSTGRES_SSLROOTCERT=/etc/ssl/certs/ca-certificates.crt`, the Debian system CA
bundle already inside the image.

`docker-compose.production-check.yml` sets `POSTGRES_SSLMODE=disable` in the
**tracked** file, never in a personal `.env`. The official `postgres` image this
topology runs does not serve TLS at all, so any requiring or verifying mode would
fail the connection outright and break the Run A smoke checks. Because the
settings module has no default, that weak local value cannot leak into a
deployment by being silently inherited — it only applies where it is written.

`POSTGRES_SSLROOTCERT` is passed to libpq **only** for the two verifying modes,
and is required there: without it libpq falls back to `~/.postgresql/root.crt`,
which does not exist for the non-root UID 10001 runtime user, and the failure
reads like a missing certificate authority rather than a missing path.

### 4.3 The SPA fallback now exists in two places

The single-page-app fallback is expressed twice, by two different mechanisms with
one intent: `apps/web/nginx/default.conf` (`try_files $uri /index.html`) for the
local verification server, and `apps/web/public/staticwebapp.config.json`
(`navigationFallback`) for Azure Static Web Apps — so a change to deep-link,
asset-caching, or `/api/` behaviour must be made in both.

---

## 5. Non-root users

| Image            | User    | UID / GID |
| ---------------- | ------- | --------- |
| API `production` | `app`   | 10001 / 10001 |
| Web `static-runtime` | `nginx` | 101 / 101 (from the unprivileged base image) |

In the API image every copied path is **root-owned and world-readable**, so the
runtime `app` user can read and execute the application but **cannot modify** the
code, the venv, or the collected static files (`touch /app/manage.py` →
permission denied).

---

## 6. Gunicorn process model

The API runs Gunicorn as **PID 1** (exec-form `CMD`, no shell wrapper), as the
non-root `app` user:

```
gunicorn quantora.wsgi:application \
  --bind 0.0.0.0:8000 --worker-class sync --no-control-socket \
  --access-logfile - --error-logfile - --timeout 60 --graceful-timeout 30
```

- **Workers** come from `WEB_CONCURRENCY` (image default 2). `--workers` is
  deliberately **not** passed so the count stays overridable at runtime.
- **`--no-control-socket` is required.** Gunicorn ≥ 25.1 otherwise creates a Unix
  control socket under `$XDG_RUNTIME_DIR` or `$HOME/.gunicorn`, and creates the
  parent directory if needed. Neither path is writable by UID 10001 in this
  image, and the control interface is never used here. (Verified: no `.gunicorn`
  directory or control socket is ever created — a container `docker diff` shows
  zero filesystem changes.)
- **No `--keep-alive`:** the sync worker does not support persistent connections
  and ignores that option.
- **Graceful shutdown:** on `SIGTERM` Gunicorn stops accepting, lets in-flight
  requests finish within `--graceful-timeout 30`, and exits **0**. Always stop
  the container with a timeout **greater than 30s** (e.g. `docker stop
  --timeout 35`), never Docker's default 10s.

### Why no entrypoint script and no supervisor

There is **one** process (Gunicorn) and **nothing** to orchestrate at
container start: no migrations, no `collectstatic` (both are build-time or
explicit-command concerns, see §7–§8), no secret templating. A shell entrypoint
or a process supervisor would add moving parts, a second PID, and a place for
startup-time failures to hide, for no benefit. Gunicorn as PID 1 receives signals
directly and reaps its own workers.

---

## 7. Liveness, readiness, and the absent HEALTHCHECK

Two public, unauthenticated endpoints:

| Endpoint                  | Meaning   | Touches the DB? | Body |
| ------------------------- | --------- | --------------- | ---- |
| `GET /api/v1/health/`     | liveness  | **no**          | `{"status":"ok","service":"quantora-api"}` |
| `GET /api/v1/health/ready/` | readiness | yes (`SELECT 1`) | `{"status":"ready",…}` / 503 `{"status":"unavailable",…}` |

Readiness runs the smallest real round trip through a cursor, catches only
`django.db.Error` (never bare `Exception`), sets `Cache-Control: no-store`, and
on failure **closes the Django connection** so a later request reconnects cleanly
once PostgreSQL returns. The 503 body carries no hostname, credential, driver
message, or exception text.

**There is deliberately no Dockerfile `HEALTHCHECK`.** Orchestrators (Azure
Container Apps, and the local production-check Compose file) own probing and are
configured to hit the HTTP endpoints directly. A baked `HEALTHCHECK` would be
redundant there, would run inside the container against `localhost`, and would
couple the image to one probing strategy.

> Note on the readiness recovery test: stopping the PostgreSQL **container**
> produces a *fast* connection failure. That proves the 503 path and the
> reconnect-after-recovery behaviour, but it does **not** exercise the
> `connect_timeout` bound — that would require a host that accepts the socket but
> never answers.

---

## 8. Migrations and build-time static collection

**Migrations are explicit**, never run on container startup. The same production
image runs the migration command:

```powershell
docker compose -f docker-compose.production-check.yml exec django-api-prod python manage.py migrate --noinput
```

Simply starting the API changes no `django_migrations` rows; running `migrate`
twice is a no-op the second time. `makemigrations --check` reports no new
migrations — Phase 10 changed no models.

**Static files are collected at image build time** in the `static-builder`
stage, into `STATIC_ROOT=/app/staticfiles`, and served at runtime by
**WhiteNoise** (`CompressedManifestStaticFilesStorage`, hashed manifest names,
`WhiteNoiseMiddleware` immediately after `SecurityMiddleware`). Assets are served
with `Cache-Control: …immutable`, so no separate static file server is needed for
the API.

`collectstatic` runs with the **real** `core.settings.production` module and
**inline, obviously-fake placeholder values on the RUN line only**
(`DJANGO_SECRET_KEY=build-time-placeholder-not-a-secret`, `POSTGRES_*=build`,
etc.). Those values exist purely because the production settings module requires
them at import; `collectstatic` performs no database access, contacts no
PostgreSQL, and runs no migration. Because the step runs in an intermediate
stage, the values never appear in the final image's `docker history`, but they
remain recoverable from build cache — which is exactly why they must be
non-secret. A separate "build settings module" is deliberately **not** created.

---

## 9. Local verification

> Stop the development stack first — both topologies publish host port 8000:
> ```powershell
> docker compose down          # NOT -v; keep your dev volumes
> ```

### Build the images

```powershell
docker build --target production -t quantora-api:local -f services/api/Dockerfile .
docker build --target static-runtime -t quantora-web:local -f apps/web/Dockerfile apps/web
```

### Export the React artifact (no server involved)

```powershell
docker buildx build --target artifact --output type=local,dest=./.tmp-web-artifact apps/web
# The static app is at the ROOT of ./.tmp-web-artifact (index.html + assets/).
# It contains no node_modules, .ts/.tsx, tests, MSW source, config, lockfiles, or .map files.
Remove-Item -Recurse -Force ./.tmp-web-artifact
```

### Image inspection (secret / bloat checks)

```powershell
docker run --rm quantora-api:local id                         # uid=10001 gid=10001
docker run --rm quantora-api:local sh -c 'command -v uv || echo UV_ABSENT'
docker run --rm quantora-api:local python -c "import pytest"   # must FAIL (no dev deps)
docker run --rm quantora-api:local sh -c 'ls /app/.venv/lib/python*/site-packages'  # gunicorn, whitenoise present; ruff/mypy/pytest absent
docker history --no-trunc quantora-api:local                  # no secret, password, token, or Azure credential
docker run --rm quantora-api:local sh -c 'touch /app/manage.py 2>&1 || echo READ_ONLY_OK'
```

### The production-check topology

`docker-compose.production-check.yml` is a **local verification topology**, not a
deployment descriptor. It has its own project name
(`quantora-production-check`), a **dedicated** postgres volume, and three
services: `postgres`, `django-api-prod` (target `production`, port 8000), and
`web-prod` (target `static-runtime`, port 8080). `web-prod` `depends_on`
`django-api-prod` because NGINX resolves the literal upstream hostname at config
load and exits with "host not found in upstream" otherwise.

**Two-run smoke strategy:**

- **Run A — production settings.** Brings the stack up with
  `DJANGO_SETTINGS_MODULE=core.settings.production`. Verifies: no startup
  migration; explicit `migrate` works and is idempotent; `check --deploy`;
  liveness 200; readiness 200 → 503 (postgres stopped) → 200 (recovered) while
  liveness stays 200; anonymous `auth/me/` 401; hashed admin CSS served
  `immutable`; Gunicorn is PID 1 and non-root; graceful `SIGTERM` shutdown with
  exit code 0.

  ```powershell
  docker compose -f docker-compose.production-check.yml up -d --build
  ```

- **Run B — development settings, same image.** Restart the **same** image with
  the development settings module so cookies work over plain local HTTP, then
  drive the browser flow through NGINX at <http://localhost:8080>:

  ```powershell
  $env:QUANTORA_CHECK_SETTINGS_MODULE = "core.settings.development"
  docker compose -f docker-compose.production-check.yml up -d
  ```

  The browser flow uses **development** settings because the production cookie
  flags are Secure-only and this local topology has no TLS. This is a settings
  swap on the identical image — the image itself is unchanged.

  Under development settings the Django admin renders **unstyled** — expected,
  because WhiteNoise is configured in production settings only.

**Tear down** (keep dev volumes; do not use `-v` on the development stack):

```powershell
docker compose -f docker-compose.production-check.yml down
```

Bring it back up with:

```powershell
docker compose -f docker-compose.production-check.yml up -d --build
```

---

## 10. Fresh-clone builds and the offline caveat

Both production targets build successfully from a **fresh clone** of the
repository, proving nothing depends on an untracked local file (a hand-edited
`.env`, a local `.venv`, `node_modules`, etc.).

A fully **offline** build is **not** achievable, and that is expected: `uv` and
`pnpm` frozen installs guarantee **determinism**, not offline capability, and the
pinned base images must still be pulled from their registries. "Frozen" means the
resolved versions cannot drift, not that the network is unused.

---

## 11. Phase 10 baseline image sizes

Recorded as a baseline for future comparison:

| Image                       | Size   |
| --------------------------- | ------ |
| `quantora-api:local`        | 285 MB |
| `quantora-web:local`        | 81.7 MB |

---

## 12. Deferred to later phases

Explicitly **out of scope** for Phase 10, deferred to their own phases: a
container registry; Azure (Container Registry, Container Apps, Static Web Apps,
Key Vault, Application Insights); CI image builds; SBOM generation; image
vulnerability scanning; source maps; Gunicorn `worker_tmp_dir` tuning; and
digest pinning for the development stages.
