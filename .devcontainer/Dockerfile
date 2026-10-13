FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm

# Fail the build instead of shipping a half-installed toolchain: without pipefail a broken
# `curl … | sh` installer exits 0 and the next step quietly falls back to the distro packages.
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# poppler + LibreOffice for the deck's headless visual check (RF-43). The base image ships a Yarn
# apt source whose signing key no longer verifies, and an unsigned repository makes `apt-get update`
# exit 100; drop it first, nothing here uses Yarn (`make setup` runs `npm ci`).
RUN rm -f /etc/apt/sources.list.d/yarn.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-impress poppler-utils fonts-dejavu fonts-liberation fonts-crosextra-carlito make \
    && rm -rf /var/lib/apt/lists/*

# Node for the web app, from the official tarball: it ships npm, while Debian's `nodejs` package
# only suggests it (and is Node 18, too old for Vite 8). Keep in sync with web/Dockerfile.
ARG NODE_VERSION=24.21.0
RUN arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) node_arch=x64 ;; \
      arm64) node_arch=arm64 ;; \
      *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1 --no-same-owner \
        --exclude='*/CHANGELOG.md' --exclude='*/LICENSE' --exclude='*/README.md'; \
    node --version; \
    npm --version

# Named volumes are created root-owned; pre-create the mount points owned by vscode.
RUN mkdir -p /workspace/backend/.venv /workspace/web/node_modules /home/vscode/.cache/pip /home/vscode/.npm \
       /home/vscode/.config /home/vscode/.claude \
    && chown -R vscode:vscode /workspace /home/vscode
