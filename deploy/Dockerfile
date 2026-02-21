FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System deps needed by chromadb, lxml, etc. + Tailscale
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        iptables \
        ca-certificates \
        ngircd \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# App user (non-root)
ARG USERNAME=astro
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ src/
COPY web/dist/ web/dist/
COPY config/ config/

# Entrypoint script
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# data/ and documents/ are mounted as volumes — create mount points
# Tailscale state persisted in /var/lib/tailscale (mount for persistence)
RUN mkdir -p /app/data /app/documents /var/lib/tailscale \
    && chown -R $USERNAME:$USERNAME /app

EXPOSE 8000 6667

# Entrypoint starts tailscaled, then the app (runs as root for tailscale)
ENTRYPOINT ["/app/entrypoint.sh"]
