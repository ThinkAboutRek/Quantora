# Local development with Docker Compose

Quantora's local stack runs entirely in Docker. Only **Docker Desktop** (which
includes Docker Compose) is required on your machine — Python, uv, Node, pnpm,
PostgreSQL, and Redis are all provided by the images and never need to be
installed on the host to run the stack.

The stack has four services:

| Service      | Image / build                     | Purpose                                   | Host port |
| ------------ | --------------------------------- | ----------------------------------------- | --------- |
| `django-api` | built from `services/api`         | The public Django REST API                | `8000`    |
| `frontend`   | built from `apps/web`             | React + Vite dev server (with API proxy)  | `5173`    |
| `postgres`   | `postgres:17.10-alpine3.24`       | Durable source of truth                   | *(none)*  |
| `redis`      | `redis:8.8.0-alpine3.23`          | Ephemeral coordination / cache            | *(none)*  |

`postgres` and `redis` publish **no** host ports; they are reached only over the
Compose network by service name (`postgres`, `redis`). The API and the frontend
are published so you can reach them from your browser and from `curl`.

The topology lives in [`docker-compose.yml`](../../docker-compose.yml); the
development-only wiring (published ports, source bind mounts, run commands, and
`.env`) lives in [`docker-compose.override.yml`](../../docker-compose.override.yml),
which Compose merges automatically. Every command below therefore works with a
bare `docker compose …` — no `-f` flags.

---

## 1. First-time setup

Create your local `.env` from the tracked template. In PowerShell:

```powershell
Copy-Item .env.example .env
```

Then open `.env` and set a real local value for `POSTGRES_PASSWORD` (the
template ships the placeholder `replace-with-local-password`). `.env` is
gitignored and must never be committed.

`.env` serves two purposes:

* Compose reads `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` from it
  to initialise the `postgres` container.
* It is loaded into the `django-api` container (`env_file`) so Django can read
  its settings.

> **Host vs. Docker database host.** `.env` sets `POSTGRES_HOST=127.0.0.1`, which
> is the honest value for a *host-native* connection. Inside Compose the API
> reaches PostgreSQL by service name, so the override sets `POSTGRES_HOST=postgres`
> for the `django-api` container specifically. You do not need to change `.env`
> for Docker.

### Running backend services natively on the host

Running the backend inside Docker Compose is the intended default, and the stack
above needs nothing more. If you want to run Django directly on the host instead,
Compose does not publish the PostgreSQL port, so a host-native process cannot
reach the Compose database and you need your own local PostgreSQL installation.
You must also export the five `POSTGRES_*` variables into your shell yourself,
because `.env` is loaded by Compose through `env_file` and never by Django (the
project has no `python-dotenv` or `django-environ`, a Phase 3 decision, so
`core.env` reads only `os.environ`).

```powershell
$env:POSTGRES_DB = "quantora"
$env:POSTGRES_USER = "quantora"
$env:POSTGRES_PASSWORD = "replace-with-local-password"
$env:POSTGRES_HOST = "127.0.0.1"
$env:POSTGRES_PORT = "5432"
uv run --frozen python services/api/manage.py runserver
```

Without those variables, `development.py` installs Django's `dummy` database
backend, so the process starts and `/api/v1/health/` still answers (that endpoint
deliberately does not touch the database), but the first real query raises loudly
and it never silently falls back to SQLite. The test suite is unaffected either
way, because it uses `core.settings.test` (SQLite), so `uv run --frozen pytest
packages/contracts/tests services/api/tests` runs host-native with no PostgreSQL
at all. Host-native frontend development also works normally, since Django's port
8000 is published and Vite's `API_PROXY_TARGET` default of `http://127.0.0.1:8000`
reaches the Compose Django container.

---

## 2. Build the images

```powershell
docker compose build
```

`django-api` and `frontend` are **built** from the two `Dockerfile`s. `postgres`
and `redis` are **pulled** (official images), so they are not built.

The API image installs the uv workspace from the frozen `uv.lock` into a baked
`/workspace/.venv`; the frontend image installs pnpm dependencies from the frozen
`pnpm-lock.yaml`.

---

## 3. Start and stop the stack

Start everything in the background:

```powershell
docker compose up -d
```

`django-api` waits for `postgres` to become **healthy** before it starts (a
`depends_on` health condition). `frontend` has no such dependency — it starts
immediately and simply proxies `/api` calls, which begin succeeding once the API
is up.

Watch status and health:

```powershell
docker compose ps
```

Follow logs (all services, or one):

```powershell
docker compose logs -f
docker compose logs -f django-api
```

Stop the stack but **keep** the containers and the database volume:

```powershell
docker compose stop      # containers stopped, can be restarted with `up`/`start`
docker compose down      # containers removed; the postgres_data volume is kept
```

Neither `stop` nor `down` (without `-v`) deletes your PostgreSQL data — see
[§8](#8-postgresql-persistence-and-a-full-reset).

Once the stack is up:

* API (direct): <http://localhost:8000/api/v1/health/>
* Frontend (and API through the Vite proxy): <http://localhost:5173/>

---

## 4. Migrations are explicit

The API container's command runs **only** the dev server. It deliberately does
**not** run `migrate` on startup, because implicit migrations are surprising,
race across multiple containers, and can apply schema changes you did not intend
to run yet. Migrations are a decision, so you run them yourself:

```powershell
docker compose exec django-api uv run --frozen python services/api/manage.py migrate
```

Other management commands follow the same pattern, for example:

```powershell
docker compose exec django-api uv run --frozen python services/api/manage.py showmigrations
docker compose exec django-api uv run --frozen python services/api/manage.py makemigrations --check --dry-run
docker compose exec django-api uv run --frozen python services/api/manage.py createsuperuser
```

`uv run --frozen` uses the workspace virtualenv baked into the image and never
re-resolves dependencies at runtime — the same way the workspace invokes Python
elsewhere.

---

## 5. Inspecting PostgreSQL and Redis

Open a `psql` shell inside the database container:

```powershell
docker compose exec postgres psql -U quantora -d quantora
```

Useful once connected: `\dt` lists tables, `\d accounts_user` describes the
custom user table, `\q` quits.

Ping Redis:

```powershell
docker compose exec redis redis-cli ping      # -> PONG
```

---

## 6. Logs and diagnosing an unhealthy container

`docker compose ps` shows each container's state and, where a healthcheck is
defined, its health (`starting`, `healthy`, `unhealthy`).

* **`postgres` / `redis` unhealthy or slow to come up:** read their logs with
  `docker compose logs postgres` / `docker compose logs redis`. `postgres` uses
  `pg_isready`; `redis` uses `redis-cli ping`.
* **`django-api` unhealthy:** its healthcheck is a liveness probe that fetches
  `http://localhost:8000/api/v1/health/` with the Python standard library. That
  view intentionally touches **neither PostgreSQL nor Redis**, so an unhealthy
  API means the *process* is not serving — check `docker compose logs django-api`
  for a traceback (a bad `.env`, a missing `POSTGRES_*` value, or a code error).
  A healthy API does **not** imply the database is reachable; a failing query
  will still surface at request time.

To see the raw health probe output for a container:

```powershell
docker inspect --format '{{json .State.Health}}' $(docker compose ps -q django-api)
```

---

## 7. Hot reload

Both services bind-mount their source from the host, so edits are picked up
without rebuilding:

* **`django-api`** runs `manage.py runserver`, whose autoreloader restarts the
  server when a `.py` file under the bind-mounted `./services/api` changes.
* **`frontend`** runs the Vite dev server, which applies Hot Module Replacement
  in the browser when a file under `./apps/web` changes.

You do **not** rebuild the image for source changes — only for dependency or
lockfile changes (see [§9](#9-when-a-rebuild-is-required)).

### Windows / WSL2 file-watching fallback (not enabled by default)

Filesystem change events do not always propagate across the Windows → Linux
container boundary. Django's `runserver` uses a stat-based reloader that polls,
so it generally works over the bind mount. Vite's watcher relies on native FS
events, which can be missed. **If, and only if, frontend edits stop triggering a
reload**, enable polling as a temporary local fallback by adding an environment
variable to the `frontend` service in `docker-compose.override.yml`:

```yaml
    environment:
      API_PROXY_TARGET: "http://django-api:8000"
      CHOKIDAR_USEPOLLING: "true"   # fallback only — higher CPU; do not commit
```

Polling is more CPU-intensive, so it is a fallback, not the default. Keeping your
repository inside the WSL2 filesystem generally avoids the need for it entirely.

---

## 8. PostgreSQL persistence and a full reset

PostgreSQL data lives in the named volume `postgres_data`, which is independent
of the container lifecycle.

* `docker compose down` (no `-v`) removes the containers but **keeps** the
  volume. `docker compose up -d` afterwards starts a fresh `postgres` container
  on the **same** data — your tables and applied migrations survive. You can
  confirm with `showmigrations` (it still reports everything as applied, with no
  need to re-run `migrate`).
* To wipe everything, including the database, do a full reset:

```powershell
docker compose down -v      # removes containers AND the postgres_data volume
docker compose up -d
docker compose exec django-api uv run --frozen python services/api/manage.py migrate
```

After `down -v` the next `up` starts PostgreSQL with an empty schema, so you must
re-run `migrate`.

---

## 9. When a rebuild is required

Bind mounts cover source changes, but they do **not** change what is baked into
an image. A change to dependencies or a lockfile —
`services/api/pyproject.toml`, `uv.lock`, `apps/web/package.json`, or
`pnpm-lock.yaml` — requires rebuilding the affected image; a plain container
restart will keep using the old dependencies.

Rebuild everything, or just the affected service:

```powershell
docker compose build                 # rebuild both built images
docker compose build django-api      # or target just one service
docker compose up -d --build         # rebuild (as needed) and (re)start
```

---

## Quick reference

```powershell
Copy-Item .env.example .env                  # first-time config (then set POSTGRES_PASSWORD)
docker compose build                         # build django-api + frontend images
docker compose up -d                         # start the stack
docker compose ps                            # status + health
docker compose logs -f django-api            # follow a service's logs
docker compose exec django-api uv run --frozen python services/api/manage.py migrate
docker compose exec postgres psql -U quantora -d quantora
docker compose exec redis redis-cli ping
docker compose down                          # stop; keep the database
docker compose down -v                       # stop; delete the database volume
```
