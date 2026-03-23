import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { buildServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

async function applyMigrationsOnStartup() {
  if (!env.migrateOnStartup) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["--filter=@aviary/db", "run", "prisma:migrate:deploy"], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit"
    });

    child.once("error", (error) => {
      reject(new Error(`Failed to run Prisma migrations: ${error.message}`));
    });

    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Prisma migrations failed with exit code ${code ?? "unknown"}${signal ? ` (signal: ${signal})` : ""}`
        )
      );
    });
  });
}

async function start() {
  await applyMigrationsOnStartup();

  const app = await buildServer();

  try {
    await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    throw error;
  }
}

try {
  await start();
} catch (error) {
  console.error(error);
  process.exit(1);
}
