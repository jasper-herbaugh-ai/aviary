FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /app
ENV UV_LINK_MODE=copy
COPY apps/worker/pyproject.toml ./pyproject.toml
COPY apps/worker/uv.lock ./uv.lock
COPY apps/worker/src ./src
RUN uv sync --frozen --no-dev
CMD ["uv", "run", "--no-dev", "aviary-worker"]
