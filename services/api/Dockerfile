# syntax=docker/dockerfile:1

# ============================================================================
# Quantora API — Django service image.
#
# The build context is the REPOSITORY ROOT (see docker-compose.yml): the Django
# service is a member of the uv workspace and resolves its dependencies from the
# root lockfile, so the image is built exactly the way CI installs the
# workspace.
#
# Stages:
#   base           — development-oriented workspace venv (Phase 5, unchanged).
#   development    — the Compose development target (Phase 5, unchanged).
#   python-builder — API-only production venv from the frozen lockfile.
#   static-builder — flattened runtime layout + collectstatic + bytecode.
#   production     — the deployable runtime: non-root gunicorn, narrow copies.
#
# Production FROM/COPY references are pinned tag@sha256:INDEX-digest (the
# multi-platform index digest, not a per-platform manifest digest). The
# development stages keep their Phase 5 tag-only pins.
# ============================================================================

FROM python:3.13.14-slim-bookworm AS base

# uv, pinned to the exact version this workspace already resolves to (0.11.28),
# copied from the official Astral image — never an install script, pip, or an
# unpinned/`latest` tag.
COPY --from=ghcr.io/astral-sh/uv:0.11.28 /uv /uvx /usr/local/bin/

# - UV_PYTHON_DOWNLOADS=never: use the interpreter already in the base image.
# - UV_LINK_MODE=copy: the build context and cache live on different mounts.
# - UV_COMPILE_BYTECODE=1: byte-compile installed packages for faster startup.
# - PYTHONDONTWRITEBYTECODE=1: never write .pyc into the bind-mounted source.
ENV UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /workspace

# Only the files uv needs to resolve and install the workspace from the frozen
# lockfile. quantora-contracts is the one buildable package, so its source is
# copied; the three services are non-packaged members, so only their manifests
# are needed. The Django source itself is intentionally NOT copied — it is
# bind-mounted over ./services/api at runtime (docker-compose.override.yml).
COPY pyproject.toml uv.lock ./
COPY packages/contracts/ ./packages/contracts/
COPY services/api/pyproject.toml ./services/api/pyproject.toml
COPY services/market-data/pyproject.toml ./services/market-data/pyproject.toml
COPY services/risk-engine/pyproject.toml ./services/risk-engine/pyproject.toml

# Install the entire workspace into /workspace/.venv from the frozen lockfile —
# the same command CONTRIBUTING and CI document. psycopg[binary] ships prebuilt
# wheels, so no libpq-dev / gcc build toolchain is required.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --all-packages --frozen

# Put the workspace virtualenv first on PATH so the container's health-check
# interpreter (and any ad-hoc process) uses it directly.
ENV VIRTUAL_ENV=/workspace/.venv \
    PATH=/workspace/.venv/bin:$PATH

FROM base AS development
# No CMD: docker-compose.override.yml supplies the run command
# (uv run … manage.py runserver 0.0.0.0:8000).

# ============================================================================
# python-builder — production dependency install, API-scoped.
#
# Deliberately NOT `FROM base`: the base stage runs `uv sync --all-packages`,
# which installs the dev dependency group (ruff, mypy, pytest, stubs) and every
# sibling service's dependencies. The production venv must carry none of that,
# so this stage starts clean from the pinned Python image and installs only the
# quantora-api dependency closure from the frozen lockfile.
# ============================================================================
FROM python:3.13.14-slim-bookworm@sha256:9d7f287598e1a5a978c015ee176d8216435aaf335ed69ac3c38dd1bbb10e8d64 AS python-builder

COPY --from=ghcr.io/astral-sh/uv:0.11.28@sha256:0f36cb9361a3346885ca3677e3767016687b5a170c1a6b88465ec14aefec90aa /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# uv resolves the lockfile against the whole workspace, so every member's
# manifest must be present even though only the API's dependencies are
# installed. quantora-contracts is the one buildable member, so its source is
# copied; the services are non-packaged, so their manifests suffice.
COPY pyproject.toml uv.lock ./
COPY packages/contracts/ ./packages/contracts/
COPY services/api/pyproject.toml ./services/api/pyproject.toml
COPY services/market-data/pyproject.toml ./services/market-data/pyproject.toml
COPY services/risk-engine/pyproject.toml ./services/risk-engine/pyproject.toml

# API-scoped, frozen, production-only, non-editable: exactly the quantora-api
# dependency closure from uv.lock — no dev group, no sibling services, and no
# editable path hooks. The venv lands at /app/.venv.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --package quantora-api --frozen --no-dev --no-editable

# ============================================================================
# static-builder — flatten to the runtime layout, collect static, precompile.
#
# The layout collectstatic sees here is byte-identical to the runtime layout
# (/app/src + /app/manage.py + /app/.venv), so the manifest paths it writes are
# valid at runtime. The placeholder values on the RUN line are obviously fake,
# never become image ENV, and exist only because the production settings module
# requires them at import; collectstatic performs no database access.
# ============================================================================
FROM python-builder AS static-builder

COPY services/api/src /app/src
COPY services/api/manage.py /app/manage.py

ENV PYTHONPATH=/app/src \
    PATH=/app/.venv/bin:$PATH

RUN DJANGO_SETTINGS_MODULE=core.settings.production \
    DJANGO_SECRET_KEY=build-time-placeholder-not-a-secret \
    DJANGO_ALLOWED_HOSTS=localhost \
    POSTGRES_DB=build POSTGRES_USER=build POSTGRES_PASSWORD=build \
    POSTGRES_HOST=localhost POSTGRES_PORT=5432 \
    python manage.py collectstatic --noinput

# Bake the application bytecode so the read-only runtime never recompiles it
# (PYTHONDONTWRITEBYTECODE is set in the production stage).
RUN python -m compileall -q /app/src

# ============================================================================
# production — the deployable runtime.
#
# Narrow, root-owned copies only; a dedicated unprivileged user; no VOLUME, no
# HEALTHCHECK (orchestrators probe the HTTP endpoints), no entrypoint script,
# no migrations on startup. Migrations are run explicitly with the same image:
#   docker compose ... exec django-api-prod python manage.py migrate --noinput
# ============================================================================
FROM python:3.13.14-slim-bookworm@sha256:9d7f287598e1a5a978c015ee176d8216435aaf335ed69ac3c38dd1bbb10e8d64 AS production

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home app

WORKDIR /app

# All copies stay root-owned (and world-readable), so the runtime user cannot
# modify the application code, the venv, or the collected static files.
COPY --from=python-builder /app/.venv /app/.venv
COPY --from=static-builder /app/src /app/src
COPY --from=static-builder /app/manage.py /app/manage.py
COPY --from=static-builder /app/staticfiles /app/staticfiles

# No DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, or database value is baked here:
# the runtime environment supplies all of them. WEB_CONCURRENCY is gunicorn's
# documented default source for the worker count and stays overridable.
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONPATH=/app/src \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WEB_CONCURRENCY=2

ARG APP_VERSION=dev
ARG APP_REVISION=unknown
# No org.opencontainers.image.created: a changing timestamp would prevent
# otherwise identical builds from producing the same digest.
LABEL org.opencontainers.image.title="quantora-api" \
    org.opencontainers.image.description="Quantora Django API service" \
    org.opencontainers.image.source="https://github.com/ThinkAboutRek/Quantora" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.version="${APP_VERSION}" \
    org.opencontainers.image.revision="${APP_REVISION}"

EXPOSE 8000

USER app

# Exec form, no shell. --no-control-socket is required: gunicorn >= 25.1
# creates a Unix control socket under $XDG_RUNTIME_DIR or $HOME/.gunicorn by
# default and neither path is writable by UID 10001 here; the control
# interface is never used. No --workers (WEB_CONCURRENCY governs it) and no
# --keep-alive (the sync worker ignores it).
CMD ["gunicorn", "quantora.wsgi:application", \
    "--bind", "0.0.0.0:8000", \
    "--worker-class", "sync", \
    "--no-control-socket", \
    "--access-logfile", "-", \
    "--error-logfile", "-", \
    "--timeout", "60", \
    "--graceful-timeout", "30"]
