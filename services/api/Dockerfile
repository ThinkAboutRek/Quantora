# syntax=docker/dockerfile:1

# ============================================================================
# Quantora API — Django service image (local development).
#
# The build context is the REPOSITORY ROOT (see docker-compose.yml): the Django
# service is a member of the uv workspace and resolves its dependencies from the
# root lockfile, so the image is built exactly the way CI installs the
# workspace.
#
# Two stages only — `base` (the workspace virtualenv) and `development`. There
# is deliberately no production stage, gunicorn, non-root user switch, or
# Azure-specific content here; that is Phase 10's job on this same file.
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
