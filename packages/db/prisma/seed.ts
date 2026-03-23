import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import playbooks from "../../playbooks/playbooks.json" assert { type: "json" };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for seeding");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

type Step = {
  order: number;
  command: string;
  expectedExitCode?: number;
  parseRule?: Record<string, unknown>;
};

type ManifestPlaybook = {
  name: string;
  description?: string;
  useSudo?: boolean;
  steps: Step[];
};

async function main() {
  await prisma.appConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", oidcEnabled: false }
  });

  const manifestNames = new Set((playbooks as ManifestPlaybook[]).map((pb) => pb.name));

  await prisma.playbook.deleteMany({
    where: {
      isBuiltin: true,
      name: {
        notIn: Array.from(manifestNames)
      }
    }
  });

  for (const pb of playbooks as ManifestPlaybook[]) {
    const created = await prisma.playbook.upsert({
      where: { name: pb.name },
      update: {
        description: pb.description,
        isBuiltin: true,
        useSudo: pb.useSudo ?? false
      },
      create: {
        name: pb.name,
        description: pb.description,
        isBuiltin: true,
        useSudo: pb.useSudo ?? false,
        stepsJson: pb.steps as unknown as object
      }
    });

    await prisma.playbookStep.deleteMany({ where: { playbookId: created.id } });

    await prisma.playbookStep.createMany({
      data: pb.steps.map((step) => ({
        playbookId: created.id,
        order: step.order,
        command: step.command,
        expectedExitCode: step.expectedExitCode ?? 0,
        parseRule: (step.parseRule ?? null) as unknown as object
      }))
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
