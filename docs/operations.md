# Operations

## Logs and correlation

- API logs include Fastify request IDs by default.
- Worker logs include job IDs and error traces.
- Use `job.id` as correlation key across API DB records and worker output.

## Backup and restore

### Backup

```bash
pg_dump -Fc -h localhost -U postgres aviary > aviary.dump
```

### Restore

```bash
dropdb -h localhost -U postgres aviary
createdb -h localhost -U postgres aviary
pg_restore -h localhost -U postgres -d aviary aviary.dump
```

## Basic throughput check

- Monitor queued jobs:

```sql
SELECT status, count(*) FROM jobs GROUP BY status;
```

- Increase `WORKER_CONCURRENCY` and worker replicas when `queued` count grows faster than completions.
