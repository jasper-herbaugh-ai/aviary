import type PgBoss from "pg-boss";
import { CronExpressionParser } from "cron-parser";
import { JobStatus, PrismaClient, TargetType } from "@aviary/db";
import { PLAYBOOK_QUEUE } from "./queue.js";

function nextRun(cronExpression: string, fromDate: Date): Date {
  const interval = CronExpressionParser.parse(cronExpression, { currentDate: fromDate });
  return interval.next().toDate();
}

async function resolveTargetServers(prisma: PrismaClient, targetType: TargetType, targetIds: string[]) {
  if (targetType === "all") {
    const all = await prisma.server.findMany({ where: { active: true }, select: { id: true } });
    return all.map((item) => item.id);
  }

  if (targetType === "server") {
    const servers = await prisma.server.findMany({
      where: { id: { in: targetIds }, active: true },
      select: { id: true }
    });
    return servers.map((item) => item.id);
  }

  const tagged = await prisma.server.findMany({
    where: { active: true, tags: { hasSome: targetIds } },
    select: { id: true }
  });
  return tagged.map((item) => item.id);
}

export function startScheduler(prisma: PrismaClient, boss: PgBoss) {
  const timer = setInterval(async () => {
    const now = new Date();

    const dueSchedules = await prisma.schedule.findMany({
      where: {
        enabled: true,
        nextRunAt: {
          lte: now
        }
      }
    });

    for (const schedule of dueSchedules) {
      const serverIds = await resolveTargetServers(prisma, schedule.targetType, schedule.targetIds);

      for (const serverId of serverIds) {
        const job = await prisma.job.create({
          data: {
            scheduleId: schedule.id,
            playbookId: schedule.playbookId,
            serverId,
            useSudo: schedule.useSudo,
            status: JobStatus.queued
          }
        });

        const queueJobId = await boss.send(PLAYBOOK_QUEUE, {
          jobId: job.id,
          serverId,
          playbookId: schedule.playbookId,
          useSudo: schedule.useSudo
        });

        await prisma.job.update({
          where: { id: job.id },
          data: { queueJobId }
        });
      }

      await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          nextRunAt: nextRun(schedule.cronExpression, now)
        }
      });
    }
  }, 15000);

  return () => clearInterval(timer);
}
