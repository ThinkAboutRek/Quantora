# syntax=docker/dockerfile:1

# ============================================================================
# Quantora web (React + Vite).
#
# The build context is ./apps/web. Stages:
#   base           — frozen dependency install (Phase 5, unchanged).
#   development    — the Compose development target (Phase 5, unchanged).
#   build          — production bundle (tsc -b && vite build).
#   artifact       — FROM scratch; export-only carrier of dist/ (not runnable).
#   static-runtime — unprivileged nginx serving the bundle; exists ONLY to
#                    verify the static build and browser flow locally. The
#                    locked production destination for the bundle is Azure
#                    Static Web Apps, not this container.
#
# The production FROM reference is pinned tag@sha256:INDEX-digest; the
# development stages keep their Phase 5 tag-only pin.
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

# ============================================================================
# build — the production bundle.
#
# Inherits base, which already ran `pnpm install --frozen-lockfile` under the
# Corepack pin, so no new Node reference is introduced. Only the files the
# build needs are copied; no .env file enters the image and source maps stay
# disabled (the Vite default).
# ============================================================================
FROM base AS build

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src/ ./src/

# The API base is fixed to the same-origin path for the built bundle. It is a
# non-secret, root-relative path; the ARG->ENV promotion scopes it to this
# intermediate stage only (nothing from this stage's ENV reaches
# static-runtime, which copies files, not environment).
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN pnpm run build

# ============================================================================
# artifact — export-only carrier for the built static application.
#
# Not runnable (FROM scratch, no process). Extract it with:
#   docker buildx build --target artifact --output type=local,dest=DIR apps/web
# The dist contents sit at the ROOT of the exported directory.
# ============================================================================
FROM scratch AS artifact

COPY --from=build /app/dist/ /

# ============================================================================
# static-runtime — local verification server for the static bundle.
#
# Unprivileged nginx (stable branch, plain Alpine variant), pinned by index
# digest. Only conf.d/default.conf is replaced — the image's top-level
# nginx.conf keeps its unprivileged PID path and temp-directory configuration.
# This container is NOT deployed anywhere; see docs/operations/containers.md.
# ============================================================================
FROM nginxinc/nginx-unprivileged:1.30.4-alpine3.24@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49 AS static-runtime

COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

ARG APP_VERSION=dev
ARG APP_REVISION=unknown
# No org.opencontainers.image.created: a changing timestamp would prevent
# otherwise identical builds from producing the same digest.
LABEL org.opencontainers.image.title="quantora-web" \
    org.opencontainers.image.description="Quantora React SPA served by unprivileged nginx (local verification)" \
    org.opencontainers.image.source="https://github.com/ThinkAboutRek/Quantora" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.version="${APP_VERSION}" \
    org.opencontainers.image.revision="${APP_REVISION}"
