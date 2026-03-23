import PgBoss from "pg-boss";
import { env } from "./env.js";

export const PLAYBOOK_QUEUE = "playbook-jobs";

export async function createQueueClient() {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PGBOSS_SCHEMA
  });

  await boss.start();
  await boss.createQueue(PLAYBOOK_QUEUE);

  return boss;
}
