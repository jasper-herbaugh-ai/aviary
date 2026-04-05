import { execSync } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;

export async function setup() {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();

  const dbUrl = container.getConnectionUri();
  process.env.DATABASE_URL = dbUrl;
  process.env.JWT_SECRET = "test-jwt-secret-at-least-16-chars!!";
  process.env.CREDENTIAL_ENCRYPTION_KEY = "test-cred-key-32chars-padded-xxx";
  process.env.LOCAL_BOOTSTRAP_ADMIN = "true";
  process.env.LOCAL_BOOTSTRAP_ADMIN_EMAIL = "admin@test.local";
  process.env.LOCAL_BOOTSTRAP_ADMIN_PASSWORD = "password123";
  process.env.MIGRATE_ON_STARTUP = "false";
  process.env.PGBOSS_SCHEMA = "pgboss_test";
  process.env.API_GRPC_PORT = "50099";
  process.env.INTERNAL_API_TOKEN = "test-internal-token";

  execSync("bunx prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe"
  });
}

export async function teardown() {
  await container?.stop();
}
