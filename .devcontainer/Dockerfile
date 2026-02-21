FROM python:3.12-slim

# Avoid interactive prompts during package install
ENV DEBIAN_FRONTEND=noninteractive

# Install system deps needed by some Python packages (e.g. lxml, chromadb)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
        nano \
        tmux \
        ngircd \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user matching the default VS Code devcontainer convention
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN apt-get update \
    && apt-get install -y --no-install-recommends sudo \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Install Tailscale
RUN curl -fsSL https://tailscale.com/install.sh | sh

USER $USERNAME

# Install Cursor CLI (agent)
RUN curl -fsS https://cursor.com/install | bash

# Ensure ~/.local/bin is on PATH for the Cursor CLI
ENV PATH="/home/${USERNAME}/.local/bin:${PATH}"
