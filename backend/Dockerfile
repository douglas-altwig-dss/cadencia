# Image shared by the `api` and `collector` services.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CADENCIA_DATA_DIR=/data

# LibreOffice enables the headless visual check of generated decks (RF-43). It is large, so opt in:
#   docker compose build --build-arg WITH_LIBREOFFICE=true
ARG WITH_LIBREOFFICE=false
RUN if [ "$WITH_LIBREOFFICE" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends libreoffice-impress poppler-utils fonts-dejavu \
      && rm -rf /var/lib/apt/lists/*; \
    fi

RUN addgroup --system cadencia && adduser --system --ingroup cadencia --home /app cadencia \
    && mkdir -p /data && chown cadencia:cadencia /data

WORKDIR /app
COPY pyproject.toml ./
COPY cadencia ./cadencia
RUN pip install .

USER cadencia
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1
CMD ["cadencia", "serve", "--port", "8000"]
