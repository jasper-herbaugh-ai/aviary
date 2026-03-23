import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    database_url: str
    encryption_key: str
    api_base_url: str
    internal_api_token: str
    pgboss_schema: str
    pgboss_queue: str
    poll_interval_ms: int
    command_timeout_s: int
    worker_concurrency: int


def load_config() -> Config:
    return Config(
        database_url=os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/aviary"),
        encryption_key=os.environ.get("CREDENTIAL_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef"),
        api_base_url=os.environ.get("WORKER_API_BASE_URL", "http://localhost:4000"),
        internal_api_token=os.environ.get("INTERNAL_API_TOKEN", "internal-token"),
        pgboss_schema=os.environ.get("PGBOSS_SCHEMA", "pgboss"),
        pgboss_queue=os.environ.get("PGBOSS_QUEUE", "playbook-jobs"),
        poll_interval_ms=int(os.environ.get("WORKER_POLL_INTERVAL_MS", "2000")),
        command_timeout_s=int(os.environ.get("WORKER_COMMAND_TIMEOUT_S", "120")),
        worker_concurrency=int(os.environ.get("WORKER_CONCURRENCY", "5")),
    )
