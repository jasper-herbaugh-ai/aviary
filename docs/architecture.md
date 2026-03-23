# SSH Orchestration Platform — Architecture & Design Plan

## Overview

A lightweight, agent-less Linux server management platform designed for MSPs and homelabs. The platform provides scheduled patch management, health monitoring (with a focus on storage), playbook execution, and alerting — all over SSH with no agents or plugins required on target servers.

The primary design philosophy is **simplicity without sacrificing scalability**. The platform is built as a distributed microservices architecture from day one, allowing individual services to scale horizontally and be deployed independently via Docker Swarm or Kubernetes.

---

## Goals

- **Agent-less execution** — communicate with target servers exclusively over SSH; no daemons, no plugins, no footprint on managed hosts
- **Scheduled automation** — run playbooks and health checks on configurable cron schedules
- **Storage & health visibility** — proactive monitoring of disk usage, memory, and system health across all managed servers before problems occur
- **Playbook management** — a library of pre-built playbooks (patch management, disk cleanup, service checks) plus the ability to write, import, and share custom ones
- **SSO-first auth** — Authentik (OIDC) integration for authentication and authorization from day one
- **Reliable migrations** — Prisma as the ORM and migration engine; migration safety is non-negotiable
- **Horizontal scalability** — worker services are stateless and independently scalable; Postgres is the single source of truth for all state and job queuing
- **Open source** — designed to be approachable for contributors and deployable by MSPs with minimal infrastructure requirements

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Frontend                   │
│         (React, wizard-driven UI, SSO login)        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│                   API Server                        │
│  - Auth / OIDC (Arctic + Authentik)                 │
│  - Inventory & credential management                │
│  - Playbook management (built-in + custom)          │
│  - Job scheduling (pgBoss → Postgres)               │
│  - Result ingestion & alert evaluation              │
│  - Prisma ORM / migrations                          │
└──────────────────────┬──────────────────────────────┘
                       │ Postgres (pgBoss job queue)
┌──────────────────────▼──────────────────────────────┐
│               Python Worker(s)                      │
│  - Consumes jobs from pgBoss queue via Postgres     │
│  - SSH execution (AsyncSSH, agent-less)             │
│  - Playbook interpreter (shell scripts / commands)  │
│  - Result + stdout reporting back to API/DB         │
│  - Stateless — scale horizontally as needed         │
└──────────────────────┬──────────────────────────────┘
                       │ SSH (port 22)
┌──────────────────────▼──────────────────────────────┐
│             Target Linux Servers                    │
│         (no agents, no plugins required)            │
└─────────────────────────────────────────────────────┘
```

---

## Services

### 1. Frontend — Next.js / React

The user-facing interface. Wizard-driven for onboarding new servers and creating playbooks. Communicates exclusively with the API Server via REST/WebSocket.

**Key responsibilities:**
- Server onboarding wizard (hostname, IP, port, credential selection, tag assignment)
- Playbook creation wizard (command sequences, scheduling, target selection)
- Dashboard — per-server health cards (disk, memory, last run status)
- Job history and run output viewer
- Alert configuration and notification preferences
- SSO login via Authentik OIDC redirect

**Tech:** Next.js, React, Tailwind CSS, ShadCN UI

---

### 2. API Server

The core application server. Owns all business logic, data access, and job orchestration. Stateless beyond its Postgres connection.

**Key responsibilities:**
- OIDC authentication flow via Arctic (Authentik provider)
- JWT session management
- CRUD for servers, credentials, playbooks, schedules, alerts
- Job creation and scheduling via pgBoss
- Receiving and storing results from workers
- Alert evaluation on result ingestion (e.g. disk > 85% threshold)
- Serving job history and run logs to the frontend

**Tech:** Next.js, Prisma ORM, pgBoss, Arctic, PostgreSQL

---

### 3. Worker — Python

A stateless background executor. Pulls jobs from the pgBoss queue in Postgres, executes them against target servers over SSH, and writes results back. Multiple worker replicas can run simultaneously — pgBoss handles deduplication and ensures jobs are not double-executed.

**Key responsibilities:**
- Poll pgBoss job queue in Postgres
- Establish SSH connections to target servers (key-based or password)
- Execute playbook commands in sequence
- Parse stdout for health check values (disk usage percentages, service status, etc.)
- Report structured results back to the API or directly to Postgres
- Handle connection timeouts, retries, and failure reporting

**Tech:** Python, AsyncSSH, Procrastinate (or direct pgBoss table polling), asyncio

---

### 4. Database — PostgreSQL

Single source of truth for all application state, job queues, and results. No Redis, no RabbitMQ, no additional queue infrastructure required.

**Key responsibilities:**
- Application data (servers, credentials, playbooks, job definitions)
- pgBoss job queue tables (managed by Next.JS/pgBoss)
- Job run history and stdout results
- Alert rules and notification state
- Migration history (managed by Prisma)

---

## Tentative Data Model (Core Entities)

```
Server
  id, hostname, ip_address, port, display_name,
  os_type, tags[], active, created_at, updated_at

Credential
  id, name, type (ssh_key | password), encrypted_value,
  username, created_at

ServerCredential
  server_id → Server
  credential_id → Credential

Playbook
  id, name, description, is_builtin, steps (JSON),
  created_by, created_at, updated_at

PlaybookStep
  id, playbook_id → Playbook
  order, command, expected_exit_code,
  parse_rule (JSON — e.g. parse disk % from df output)

Schedule
  id, playbook_id → Playbook
  target_type (server | tag | all)
  target_ids[]
  cron_expression, enabled, last_run_at, next_run_at

Job
  id, schedule_id → Schedule (nullable for ad-hoc)
  playbook_id → Playbook
  server_id → Server
  status (queued | running | success | failed | timeout)
  enqueued_at, started_at, completed_at

JobResult
  id, job_id → Job
  step_order, command, exit_code,
  stdout, stderr, duration_ms, parsed_values (JSON)

Alert
  id, server_id → Server
  metric (disk_percent | memory_percent | custom)
  threshold, operator (gt | lt | eq)
  severity (info | warning | critical)
  notification_channel, last_triggered_at

Notification
  id, alert_id → Alert
  triggered_at, message, acknowledged, acknowledged_at
```

---

## Built-in Playbooks

The platform ships with a standard library of pre-built playbooks covering the most common MSP/homelab use cases:

| Playbook | Description |
|---|---|
| `apt-upgrade` | `apt update && apt upgrade -y` with pre/post snapshot of installed packages |
| `dnf-upgrade` | `dnf update -y` for RHEL/Fedora/Rocky hosts |
| `disk-health-check` | `df -h` parsed into per-mount disk usage percentages |
| `memory-check` | `free -m` parsed into used/available/swap |
| `service-status` | Check if a named service is active via `systemctl is-active` |
| `reboot-check` | Check if a reboot is required (`/var/run/reboot-required`) |
| `uptime-check` | `uptime` parsed into load averages and uptime duration |
| `journal-errors` | Last 50 error-level journal entries |
| `docker-health` | `docker ps` — container count, any containers in restart loop |
| `failed-logins` | Last 24h failed SSH login attempts from auth log |
| `cert-expiry-check` | Check SSL certificate expiry for a given domain/port |

---

## Deployment

The platform is designed to be deployed as a Docker Swarm stack (or Compose for single-node setups). Each service is a separate container image.

```yaml
# Logical service layout
services:
  web:        # Next.js frontend
  api:        # API Server
  worker:     # Python SSH worker (scale: 3+)
  postgres:   # PostgreSQL
  traefik:    # Reverse proxy / TLS termination (optional, existing infra)
```

Workers are the only service that needs to scale. The API and frontend remain single-instance in most deployments. pgBoss handles distributed job claiming automatically when multiple worker replicas are running.

---

## Authentication

Authentication is OIDC-first via Authentik. The platform does not manage its own user database beyond storing the OIDC subject identifier for authorization purposes.

**Flow:**
1. User clicks "Sign In" → redirected to Authentik authorization endpoint
2. Authentik authenticates the user (MFA, SSO, etc.)
3. Callback returns authorization code to the API
4. API exchanges code for tokens via Arctic
5. API issues its own JWT for frontend session management
6. JWT contains user ID, roles, and org context

**Local fallback:** An optional local admin account for initial setup before Authentik is configured.

---

## Monorepo Structure

```
/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # API Server
│   └── worker/           # Python SSH worker
├── packages/
│   ├── db/               # Prisma schema, migrations, generated client (shared)
│   ├── types/            # Shared TypeScript types/DTOs
│   └── playbooks/        # Built-in playbook definitions (JSON/YAML)
├── docker/
│   ├── docker-compose.yml
│   └── stack.yml         # Swarm stack definition
└── docs/
    └── architecture.md
```

The `packages/db` package is shared between the `api` app and any future TypeScript services. The Python worker reads from and writes to Postgres directly using the same schema — it does not import or depend on the TypeScript packages.

---

## Technology Stack Summary

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, Tailwind CSS, ShadCN UI |
| API | API Server (TypeScript) |
| ORM & Migrations | Prisma |
| Job Queue | pgBoss (Postgres-native) |
| Auth | Arctic + Authentik (OIDC) |
| Worker | Python, AsyncSSH, asyncio |
| Database | PostgreSQL |
| Container Orchestration | Docker Swarm (or Compose) |
| Reverse Proxy | Traefik |

---

## Non-Goals (v1)

The following are explicitly out of scope for the initial version to prevent scope creep:

- Ansible/YAML playbook DSL support
- Agent-based monitoring (everything is SSH pull)
- Windows server support
- Multi-tenancy / org isolation (single-org initially)
- Custom plugin system
- Kubernetes deployment (Swarm-first, K8s later)
- Built-in alerting delivery (v1 logs alerts to DB; notification channels like email/Slack come later)

---

## Future Considerations

- **Notification channels** — email, Slack, Teams, PagerDuty webhooks for alert delivery
- **Remediation playbooks** — auto-trigger a cleanup playbook when a disk alert fires
- **Audit log** — full history of who ran what against which server
- **Credential rotation** — automated SSH key rotation via playbook
- **Multi-org / RBAC** — per-org server isolation for MSP multi-tenant use
- **Import/export** — share custom playbooks as JSON/YAML files
- **Marketplace** — community playbook repository
