import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

  // Run migrations from packages/db where prisma.config.ts lives.
  // prisma.config.ts reads DATABASE_URL from env (dotenv won't override it).
  const __filename = fileURLToPath(import.meta.url);
  const dbPackageDir = resolve(dirname(__filename), "../../../../packages/db");

  execSync("bunx prisma migrate deploy", {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe"
  });
}

export async function teardown() {
  await container?.stop();
}
