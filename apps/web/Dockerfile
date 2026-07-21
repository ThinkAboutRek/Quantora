# syntax=docker/dockerfile:1

# ============================================================================
# Quantora web (React + Vite) — local development image.
#
# The build context is ./apps/web. Two stages only — `base` (frozen dependency
# install) and `development`. There is deliberately no production stage and no
# nginx; serving a built SPA is a later concern.
# ============================================================================

FROM node:24.18.0-bookworm-slim AS base

# Provision the exact pnpm pinned in package.json (`packageManager`, 11.11.0)
# through Corepack, which ships with Node — no global pnpm install.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Install from the frozen lockfile in its own layer so dependency installs are
# cached across source-only changes. The app source is bind-mounted at runtime,
# and a named volume preserves this container-built node_modules
# (docker-compose.override.yml).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS development
# No CMD: docker-compose.override.yml supplies the run command (pnpm dev --host).
